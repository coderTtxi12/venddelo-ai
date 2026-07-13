"""menu_import skill — full digital menu onboarding from uploaded documents."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.import_assets import validate_import_asset_path
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_import.apply_batch import ApplyFullResult, apply_full_import
from app.modules.assistant.skills.menu_import.batching import (
    count_batch_products,
    single_batch_from_draft,
)
from app.modules.assistant.skills.menu_import.draft_enrich import enrich_import_draft
from app.modules.assistant.skills.menu_import.draft_merge import merge_draft_batches
from app.modules.assistant.skills.menu_import.draft_modeling import model_import_draft
from app.modules.assistant.skills.menu_import.menu_reconcile import (
    ReconciliationPlan,
    build_reconciliation_plan,
)
from app.modules.assistant.skills.menu_import.document_loader import load_menu_source_from_storage
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft
from app.modules.assistant.skills.menu_import.extraction import (
    extract_from_pages,
    extract_from_text,
    merge_page_drafts,
)
from app.modules.assistant.skills.menu_import.public_menu_url import build_public_menu_url
from app.modules.assistant.skills.menu_import.live_menu_to_draft import capture_live_menu_import_draft
from app.modules.assistant.skills.menu_import.session_draft_store import (
    get_ocr_original,
    list_open_questions,
    persist_extraction_snapshots,
    set_working_batch,
    unanswered_question_ids,
    validate_working_batch,
)
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.menu.service import MenuService


MENU_IMPORT_APPLY_ENABLED = False
"""When False, OCR extraction does not apply to live; apply_full_import stays hidden from tools."""

MENU_IMPORT_APPLY_AFTER_MODELING_ENABLED = True
"""When True, a successful model_working_draft with no open questions applies draft_batches to live."""

_BASE_INTERNAL_TOOL_NAMES: tuple[str, ...] = (
    "start_menu_import_session",
    "get_import_session",
    "save_menu_context",
    "register_menu_source_file",
    "start_menu_extraction_batch",
    "model_working_draft",
    "get_extraction_status",
    "update_menu_knowledge",
)
_APPLY_TOOL_NAMES: tuple[str, ...] = ("apply_full_import",) if MENU_IMPORT_APPLY_ENABLED else ()
MENU_IMPORT_INTERNAL_TOOL_NAMES: frozenset[str] = frozenset(
    _BASE_INTERNAL_TOOL_NAMES + _APPLY_TOOL_NAMES
)


def _pending_source_files(
    source_files: list[Any],
    *,
    force_reextract: bool = False,
) -> list[dict[str, Any]]:
    pending: list[dict[str, Any]] = []
    for entry in source_files:
        if not isinstance(entry, dict):
            continue
        if not force_reextract and entry.get("extracted_at"):
            continue
        pending.append(entry)
    return pending


def _repo(ctx: AgentContext) -> MenuImportSessionRepository:
    return MenuImportSessionRepository(ctx.uow.session)


def _get_active_session(ctx: AgentContext) -> MenuImportSession | None:
    return _repo(ctx).get_active_for_restaurant(ctx.restaurant_id)


def _require_session(ctx: AgentContext) -> tuple[MenuImportSession | None, ToolResult | None]:
    session = _get_active_session(ctx)
    if session is None:
        return None, ToolResult(ok=False, summary="No active menu import session")
    return session, None


def _extraction_context(session: MenuImportSession) -> dict[str, Any]:
    discovery = session.discovery_answers or {}
    return {
        "discovery_answers": discovery,
        "menu_context": str(discovery.get("menu_context") or "").strip(),
    }


def _merge_clarification_answers(session: MenuImportSession, answers: dict[str, Any]) -> None:
    merged = dict(session.clarification_answers or {})
    for key, value in answers.items():
        text = str(value).strip()
        if text:
            merged[str(key)] = text
    session.clarification_answers = merged


def _build_modeling_context(
    session: MenuImportSession,
    *,
    owner_instructions: str = "",
) -> dict[str, Any]:
    discovery = dict(session.discovery_answers or {})
    instructions = owner_instructions.strip()
    if instructions:
        discovery["last_owner_instructions"] = instructions
    return {
        **_extraction_context(session),
        "discovery_answers": discovery,
        "clarification_answers": session.clarification_answers or {},
        "open_questions": [question.model_dump() for question in list_open_questions(session)],
        "owner_instructions": instructions or str(discovery.get("last_owner_instructions") or ""),
    }


def _batch_entries(session: MenuImportSession) -> list[dict[str, Any]]:
    return [
        entry
        for entry in (session.draft_batches or [])
        if isinstance(entry, dict)
    ]


def _session_summary(session: MenuImportSession) -> dict[str, Any]:
    batches = _batch_entries(session)
    applied = sum(1 for batch in batches if batch.get("applied_at"))
    pending = len(batches) - applied
    discovery = session.discovery_answers or {}
    menu_context = str(discovery.get("menu_context") or "").strip()
    return {
        "session_id": str(session.id),
        "status": session.status,
        "source_files": len(session.source_files or []),
        "draft_batches_total": len(batches),
        "draft_batches_applied": applied,
        "draft_batches_pending": pending,
        "has_menu_context": bool(menu_context),
        "menu_context_preview": menu_context[:200] if menu_context else "",
        "has_ocr_original": bool(session.ocr_original),
        "live_menu_snapshot_at": (session.live_menu_snapshot or {}).get("captured_at"),
        "reconciliation_cached": bool(session.reconciliation_snapshot),
    }


def _format_price_mxn(mxn: float, currency: str = "MXN") -> str:
    return f"${mxn:,.2f} {currency}" if mxn % 1 else f"${mxn:,.0f} {currency}"


def _preview_batch_markdown(batch: ImportBatch) -> str:
    lines = [f"### Lote {batch.batch_index}", ""]
    if batch.global_rules:
        lines.append("**Reglas globales:**")
        for rule in batch.global_rules:
            lines.append(f"- {rule}")
        lines.append("")

    lines.append("| Categoría | Producto | Precio |")
    lines.append("| --- | --- | --- |")
    for category in batch.categories:
        for product in category.products:
            lines.append(
                f"| {category.name} | {product.name} | "
                f"{_format_price_mxn(product.price_mxn, product.currency)} |"
            )

    if batch.promotions:
        lines.append("")
        lines.append("**Promociones:**")
        for promo in batch.promotions:
            lines.append(f"- {promo.name} ({promo.type}, {promo.scope})")

    return "\n".join(lines)


def _collect_global_rules(batches: list[dict[str, Any]]) -> list[str]:
    rules: list[str] = []
    for batch in batches:
        raw = batch.get("global_rules") or []
        if isinstance(raw, list):
            rules.extend(str(item) for item in raw if str(item).strip())
    return rules


def _current_reconciliation(ctx: AgentContext, draft: ImportDraft) -> ReconciliationPlan:
    """Investigate the live menu and decide create-vs-update for every entity."""
    current = MenuService(ctx.uow.menu).get_full_menu(ctx.restaurant_id)
    return build_reconciliation_plan(draft, current)


def _public_menu_url(ctx: AgentContext) -> str:
    restaurant = ctx.uow.restaurants.get(ctx.restaurant_id)
    if restaurant is None:
        return ""
    return build_public_menu_url(restaurant.subdomain, settings=get_settings())


def _apply_draft_to_live_menu(
    ctx: AgentContext,
    session: MenuImportSession,
) -> tuple[ApplyFullResult, ImportBatch, ReconciliationPlan | None]:
    working = validate_working_batch(session)
    merged_draft = merge_draft_batches(
        [ImportBatch.model_validate(entry) for entry in _batch_entries(session)]
    )
    reconciliation = _current_reconciliation(ctx, merged_draft)
    result = apply_full_import(
        ctx, session, confirmed=True, reconciliation=reconciliation
    )
    if result.ok:
        session.status = MenuImportSessionStatus.ENRICHING.value
        _repo(ctx).update(session)
    return result, working, reconciliation


def _merge_extraction_metadata(runs: list[dict[str, Any]]) -> dict[str, Any]:
    if not runs:
        settings = get_settings()
        return {
            "extraction_mode": None,
            "vision_provider": settings.vision_provider,
            "configured_vision_model": settings.openai_vision_model,
            "configured_text_model": settings.openai_model,
            "models_used": [],
            "runs": [],
        }

    models_used: list[str] = []
    for run in runs:
        models_used.extend(run.get("models_used") or [])

    primary = runs[-1]
    return {
        "extraction_mode": primary.get("extraction_mode"),
        "vision_provider": primary.get("vision_provider"),
        "configured_vision_model": primary.get("configured_vision_model"),
        "configured_text_model": primary.get("configured_text_model"),
        "llm_provider": primary.get("llm_provider"),
        "models_used": models_used,
        "provider_class": primary.get("provider_class"),
        "source_file_count": len(runs),
        "runs": runs,
    }


def _persist_extraction_metadata(session: MenuImportSession, metadata: dict[str, Any]) -> None:
    discovery = dict(session.discovery_answers or {})
    discovery["last_extraction_metadata"] = metadata
    session.discovery_answers = discovery


def _extraction_result_data(
    session: MenuImportSession,
    batch: ImportBatch,
    *,
    ctx: AgentContext | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        **_session_summary(session),
        "extracted_products": count_batch_products(batch),
        "working_batch_products": count_batch_products(batch),
        "working_batch_categories": len(batch.categories),
        "global_rules": batch.global_rules,
        "apply_enabled": MENU_IMPORT_APPLY_ENABLED,
    }
    discovery = session.discovery_answers or {}
    metadata = discovery.get("last_extraction_metadata")
    if isinstance(metadata, dict):
        data["extraction_metadata"] = metadata
    if ctx is not None:
        data["public_menu_url"] = _public_menu_url(ctx)
    if extra:
        data.update(extra)
    return data


def _build_import_notes(session: MenuImportSession, notes: str | None) -> str:
    parts: list[str] = ["## Notas de importación", ""]
    if notes and notes.strip():
        parts.append(notes.strip())
        parts.append("")

    discovery = session.discovery_answers or {}
    menu_context = str(discovery.get("menu_context") or "").strip()
    if menu_context:
        parts.append("### Contexto del dueño (pre-OCR)")
        parts.append(menu_context)
        parts.append("")

    global_rules = _collect_global_rules(_batch_entries(session))
    if global_rules:
        parts.append("### Reglas del menú")
        for rule in global_rules:
            parts.append(f"- {rule}")
        parts.append("")

    return "\n".join(parts).strip()


class MenuImportSkill:
    id = "menu_import"

    def tool_definitions(self) -> list[ToolDefinition]:
        extraction_description = (
            "Run literal OCR/vision extraction on all registered menu source files and persist "
            "ocr_original + draft_batches. No modeling pass and no live-menu apply."
        )
        tools: list[ToolDefinition] = [
            ToolDefinition(
                name="start_menu_import_session",
                description=(
                    "Start a new menu import onboarding session for this restaurant. "
                    "Replaces any previous active session automatically."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "confirm_cancel_previous": {
                            "type": "boolean",
                            "description": "Deprecated — active sessions are always replaced.",
                            "default": True,
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_import_session",
                description="Read the active import session status, phase, and counters.",
                effect="read",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="save_menu_context",
                description=(
                    "Save owner-provided menu context for a future modeling pass. "
                    "Not used while menu import runs OCR-only."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "menu_context": {
                            "type": "string",
                            "description": "Free-text notes from the owner about how to read/organize the menu.",
                        },
                    },
                    "required": ["menu_context"],
                },
            ),
            ToolDefinition(
                name="register_menu_source_file",
                description=(
                    "Register an uploaded menu document (PDF, DOCX, or image) already stored "
                    "via the import assets API. Validates the storage path belongs to this restaurant."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "storage_path": {"type": "string"},
                        "mime_type": {"type": "string"},
                        "original_name": {"type": "string"},
                    },
                    "required": ["storage_path", "mime_type"],
                },
            ),
            ToolDefinition(
                name="start_menu_extraction_batch",
                description=extraction_description,
                effect="mutate",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="model_working_draft",
                description=(
                    "Rewrite the editable OCR clone (draft_batches) using owner clarification "
                    "answers and/or additional instructions. Always models from frozen "
                    "ocr_original; never changes ocr_original or the live menu."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "clarification_answers": {
                            "type": "object",
                            "description": (
                                "Map of open_question id → owner answer text "
                                "(e.g. {\"q_1\": \"Sí\"})."
                            ),
                            "additionalProperties": {"type": "string"},
                        },
                        "owner_instructions": {
                            "type": "string",
                            "description": (
                                "Free-text restructuring instructions from the owner for this turn."
                            ),
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_extraction_status",
                description=(
                    "Read extraction progress: batch counts, applied vs pending, and optional preview."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "batch_index": {
                            "type": "integer",
                            "description": "Optional batch index to include preview payload.",
                        },
                    },
                    "required": [],
                },
            ),
        ]
        if MENU_IMPORT_APPLY_ENABLED:
            tools.append(
                ToolDefinition(
                    name="apply_full_import",
                    description=(
                        "Apply the editable working draft (draft_batches) to the live menu. "
                        "Normally called automatically by start_menu_extraction_batch; use manually "
                        "only to re-apply an existing unapplied draft."
                    ),
                    effect="mutate",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "confirmed": {
                                "type": "boolean",
                                "description": "Must be true to apply.",
                                "default": False,
                            },
                        },
                        "required": [],
                    },
                )
            )
        tools.append(
            ToolDefinition(
                name="update_menu_knowledge",
                description=(
                    "Finalize import notes for the session and mark the import session completed."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "notes": {
                            "type": "string",
                            "description": "Optional extra notes to append.",
                        },
                    },
                    "required": [],
                },
            )
        )
        return tools

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        try:
            return self._execute(tool_name, args, ctx)
        except ValidationError as exc:
            return ToolResult(ok=False, summary=str(exc))
        except NotFoundError as exc:
            return ToolResult(ok=False, summary=str(exc))

    def _execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        if tool_name == "start_menu_import_session":
            repo = _repo(ctx)
            active = repo.get_active_for_restaurant(ctx.restaurant_id)
            if active is not None:
                repo.cancel_active(ctx.restaurant_id)
            session = repo.create(
                restaurant_id=ctx.restaurant_id,
                conversation_id=ctx.conversation_id,
                status=MenuImportSessionStatus.DISCOVERY,
            )
            session.discovery_answers = {"concierge_mode": True}
            repo.update(session)
            return ToolResult(
                ok=True,
                summary="Started menu import session",
                data=_session_summary(session),
            )

        if tool_name == "get_import_session":
            session, error = _require_session(ctx)
            if error is not None:
                return error
            assert session is not None
            return ToolResult(
                ok=True,
                summary=f"Import session status: {session.status}",
                data=_session_summary(session),
            )

        session, error = _require_session(ctx)
        if error is not None:
            return error
        assert session is not None

        if tool_name == "save_menu_context":
            menu_context = str(args.get("menu_context") or "").strip()
            if not menu_context:
                return ToolResult(ok=False, summary="menu_context is required")
            existing = dict(session.discovery_answers or {})
            existing["menu_context"] = menu_context
            session.discovery_answers = existing
            session.status = MenuImportSessionStatus.COLLECTING_SOURCES.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Saved menu context for OCR",
                data=_session_summary(session),
            )

        if tool_name == "register_menu_source_file":
            storage_path = str(args.get("storage_path") or "").strip()
            mime_type = str(args.get("mime_type") or "").strip()
            original_name = str(args.get("original_name") or "").strip() or storage_path.rsplit("/", 1)[-1]
            if not storage_path or not mime_type:
                return ToolResult(ok=False, summary="storage_path and mime_type are required")
            validate_import_asset_path(ctx.restaurant_id, storage_path, kind="menu_source")
            source_files = list(session.source_files or [])
            source_files.append(
                {
                    "path": storage_path,
                    "mime_type": mime_type,
                    "name": original_name,
                    "registered_at": datetime.now(UTC).isoformat(),
                }
            )
            session.source_files = source_files
            session.status = MenuImportSessionStatus.EXTRACTING.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary=f"Registered menu source {original_name!r}",
                data={
                    **_session_summary(session),
                    "source_file": source_files[-1],
                },
            )

        if tool_name == "start_menu_extraction_batch":
            source_files = session.source_files or []
            if not source_files:
                return ToolResult(ok=False, summary="Register at least one menu source file first")

            batches = _batch_entries(session)
            if batches and batches[0].get("applied_at"):
                batch = ImportBatch.model_validate(batches[0])
                product_count = count_batch_products(batch)
                return ToolResult(
                    ok=True,
                    summary=f"Menu already extracted and applied ({product_count} product(s))",
                    data={
                        **_session_summary(session),
                        "public_menu_url": _public_menu_url(ctx),
                        "global_rules": batch.global_rules,
                    },
                )

            if batches and not batches[0].get("applied_at"):
                batch = ImportBatch.model_validate(batches[0])
                if not MENU_IMPORT_APPLY_ENABLED:
                    product_count = count_batch_products(batch)
                    return ToolResult(
                        ok=True,
                        summary=(
                            f"Menu already extracted ({product_count} product(s)); "
                            "not applied to live menu"
                        ),
                        data=_extraction_result_data(session, batch),
                    )
                try:
                    apply_result, working, reconciliation = _apply_draft_to_live_menu(ctx, session)
                except ValueError as exc:
                    return ToolResult(ok=False, summary=str(exc))
                data: dict[str, Any] = {
                    **_session_summary(session),
                    "public_menu_url": _public_menu_url(ctx),
                    "batches_applied": apply_result.batches_applied,
                    "categories": apply_result.categories,
                    "products": apply_result.products,
                    "working_batch_products": count_batch_products(working),
                    "working_batch_categories": len(working.categories),
                }
                if reconciliation is not None:
                    data["reconciliation"] = {
                        "new_categories": reconciliation.new_categories,
                        "reused_categories": reconciliation.reused_categories,
                        "new_products": reconciliation.new_products,
                        "updated_products": reconciliation.updated_products,
                    }
                summary = (
                    f"Applied existing draft: {apply_result.products} product(s)"
                    if apply_result.ok
                    else apply_result.summary
                )
                return ToolResult(ok=apply_result.ok, summary=summary, data=data)

            context = _extraction_context(session)
            page_literals: list[ImportDraft] = []
            extraction_runs: list[dict[str, Any]] = []
            for entry in _pending_source_files(source_files):
                path = str(entry.get("path") or "").strip()
                mime = str(entry.get("mime_type") or "").strip()
                if not path or not mime:
                    continue
                validate_import_asset_path(ctx.restaurant_id, path, kind="menu_source")
                payload = load_menu_source_from_storage(path, mime)
                if payload.pages:
                    ocr, run_metadata = extract_from_pages(payload.pages, context)
                elif payload.text:
                    ocr, run_metadata = extract_from_text(payload.text, context)
                else:
                    continue
                page_literals.append(ocr)
                extraction_runs.append(run_metadata)
                entry["extracted_at"] = datetime.now(UTC).isoformat()

            merged = merge_page_drafts(page_literals) if page_literals else ImportDraft()
            merged = enrich_import_draft(merged)
            batch = single_batch_from_draft(merged)
            extraction_metadata = _merge_extraction_metadata(extraction_runs)
            persist_extraction_snapshots(
                session,
                ocr_original=merged,
                working_batch=batch,
            )
            _persist_extraction_metadata(session, extraction_metadata)
            session.source_files = source_files

            post_extraction_extra: dict[str, Any] = {}
            pending_questions = list_open_questions(session)
            if pending_questions:
                session.status = MenuImportSessionStatus.CLARIFYING.value
                post_extraction_extra["open_questions_count"] = len(pending_questions)
                post_extraction_extra["awaiting_clarification"] = True
            else:
                live_snapshot = capture_live_menu_import_draft(ctx)
                session.live_menu_snapshot = live_snapshot
                live_draft = live_snapshot.get("import_draft") or {}
                live_categories = live_draft.get("categories") or []
                live_product_count = sum(
                    len(category.get("products") or [])
                    for category in live_categories
                    if isinstance(category, dict)
                )
                post_extraction_extra["live_menu_captured"] = True
                post_extraction_extra["live_menu_products"] = live_product_count
                post_extraction_extra["live_menu_promotions"] = len(
                    live_draft.get("promotions") or []
                )

            _repo(ctx).update(session)

            product_count = count_batch_products(batch)
            if not MENU_IMPORT_APPLY_ENABLED:
                return ToolResult(
                    ok=True,
                    summary=f"Extracted {product_count} product(s) from menu source (OCR only)",
                    data=_extraction_result_data(
                        session,
                        batch,
                        ctx=ctx,
                        extra=post_extraction_extra,
                    ),
                )

            try:
                apply_result, working, reconciliation = _apply_draft_to_live_menu(ctx, session)
            except ValueError as exc:
                return ToolResult(
                    ok=False,
                    summary=f"Extracted {product_count} product(s) but apply failed: {exc}",
                    data={
                        **_session_summary(session),
                        "global_rules": merged.global_rules,
                    },
                )

            data = {
                **_session_summary(session),
                "public_menu_url": _public_menu_url(ctx),
                "extracted_products": product_count,
                "batches_applied": apply_result.batches_applied,
                "categories": apply_result.categories,
                "products": apply_result.products,
                "option_groups": apply_result.option_groups,
                "option_items": apply_result.option_items,
                "promotions": apply_result.promotions,
                "working_batch_products": count_batch_products(working),
                "working_batch_categories": len(working.categories),
                "global_rules": merged.global_rules,
            }
            if reconciliation is not None:
                data["reconciliation"] = {
                    "new_categories": reconciliation.new_categories,
                    "reused_categories": reconciliation.reused_categories,
                    "new_products": reconciliation.new_products,
                    "updated_products": reconciliation.updated_products,
                }
            summary = (
                f"Extracted and applied {apply_result.products} product(s) to live menu"
                if apply_result.ok
                else apply_result.summary
            )
            return ToolResult(ok=apply_result.ok, summary=summary, data=data)

        if tool_name == "model_working_draft":
            ocr_original = get_ocr_original(session)
            if ocr_original is None:
                return ToolResult(
                    ok=False,
                    summary="No OCR original in session — run start_menu_extraction_batch first",
                )

            raw_answers = args.get("clarification_answers")
            if isinstance(raw_answers, dict):
                _merge_clarification_answers(session, raw_answers)

            owner_instructions = str(args.get("owner_instructions") or "").strip()
            if not (session.clarification_answers or {}) and not owner_instructions:
                return ToolResult(
                    ok=False,
                    summary=(
                        "Provide clarification_answers and/or owner_instructions "
                        "to model the working draft"
                    ),
                )

            modeling_context = _build_modeling_context(
                session,
                owner_instructions=owner_instructions,
            )
            if owner_instructions:
                discovery = dict(session.discovery_answers or {})
                discovery["last_owner_instructions"] = owner_instructions
                session.discovery_answers = discovery

            modeled = model_import_draft(ocr_original, modeling_context)
            modeled = enrich_import_draft(modeled)
            working = single_batch_from_draft(modeled)
            set_working_batch(session, working)

            remaining_questions = len(unanswered_question_ids(session))
            post_modeling_extra: dict[str, Any] = {
                "modeled_products": count_batch_products(working),
                "open_questions_remaining": remaining_questions,
            }
            if remaining_questions == 0:
                if not session.live_menu_snapshot:
                    session.live_menu_snapshot = capture_live_menu_import_draft(ctx)
                live_draft = (session.live_menu_snapshot or {}).get("import_draft") or {}
                post_modeling_extra["live_menu_captured"] = bool(live_draft)

                if MENU_IMPORT_APPLY_AFTER_MODELING_ENABLED:
                    try:
                        apply_result, _working_applied, reconciliation = _apply_draft_to_live_menu(
                            ctx, session
                        )
                    except ValueError as exc:
                        session.status = MenuImportSessionStatus.OPTIMIZING.value
                        _repo(ctx).update(session)
                        return ToolResult(
                            ok=False,
                            summary=f"Modeled working draft but apply failed: {exc}",
                            data=_extraction_result_data(
                                session,
                                working,
                                ctx=ctx,
                                extra=post_modeling_extra,
                            ),
                        )

                    post_modeling_extra.update(
                        {
                            "applied_to_live": apply_result.ok,
                            "batches_applied": apply_result.batches_applied,
                            "categories": apply_result.categories,
                            "products": apply_result.products,
                            "option_groups": apply_result.option_groups,
                            "option_items": apply_result.option_items,
                            "promotions": apply_result.promotions,
                        }
                    )
                    if reconciliation is not None:
                        post_modeling_extra["reconciliation"] = {
                            "new_categories": reconciliation.new_categories,
                            "reused_categories": reconciliation.reused_categories,
                            "new_products": reconciliation.new_products,
                            "updated_products": reconciliation.updated_products,
                        }
                    if not apply_result.ok:
                        session.status = MenuImportSessionStatus.OPTIMIZING.value
                        _repo(ctx).update(session)
                    summary = (
                        f"Modeled and applied {apply_result.products} product(s) to live menu; "
                        f"0 open question(s) remaining"
                        if apply_result.ok
                        else f"Modeled working draft but apply failed: {apply_result.summary}"
                    )
                    return ToolResult(
                        ok=apply_result.ok,
                        summary=summary,
                        data=_extraction_result_data(
                            session,
                            working,
                            ctx=ctx,
                            extra=post_modeling_extra,
                        ),
                    )

                session.status = MenuImportSessionStatus.OPTIMIZING.value
            else:
                session.status = MenuImportSessionStatus.CLARIFYING.value

            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary=(
                    f"Modeled working draft ({count_batch_products(working)} product(s)); "
                    f"{remaining_questions} open question(s) remaining"
                ),
                data=_extraction_result_data(
                    session,
                    working,
                    ctx=ctx,
                    extra=post_modeling_extra,
                ),
            )

        if tool_name == "get_extraction_status":
            batches = _batch_entries(session)
            batch_index = args.get("batch_index")
            payload: dict[str, Any] = {
                **_session_summary(session),
                "batches": [
                    {
                        "batch_index": batch.get("batch_index", index),
                        "applied": bool(batch.get("applied_at")),
                        "product_count": count_batch_products(
                            ImportBatch.model_validate(batch)
                        ),
                    }
                    for index, batch in enumerate(batches)
                ],
            }
            discovery = session.discovery_answers or {}
            metadata = discovery.get("last_extraction_metadata")
            if isinstance(metadata, dict):
                payload["extraction_metadata"] = metadata
            if batch_index is not None:
                index = int(batch_index)
                if index < 0 or index >= len(batches):
                    return ToolResult(ok=False, summary=f"Batch index {index} not found")
                batch = ImportBatch.model_validate(batches[index])
                payload["preview"] = {
                    "batch_index": index,
                    "markdown": _preview_batch_markdown(batch),
                    "batch": batch.model_dump(),
                }
            return ToolResult(
                ok=True,
                summary="Extraction status",
                data=payload,
            )

        if tool_name == "apply_full_import":
            if not MENU_IMPORT_APPLY_ENABLED:
                return ToolResult(
                    ok=False,
                    summary="apply_full_import is temporarily disabled while OCR is being validated",
                )
            try:
                confirmed = bool(args.get("confirmed", False))
                if not confirmed:
                    return ToolResult(ok=False, summary="confirmed=true is required to apply full import")
                apply_result, working, reconciliation = _apply_draft_to_live_menu(ctx, session)
            except ValueError as exc:
                return ToolResult(ok=False, summary=str(exc))
            data = {
                "batches_applied": apply_result.batches_applied,
                "categories": apply_result.categories,
                "products": apply_result.products,
                "option_groups": apply_result.option_groups,
                "option_items": apply_result.option_items,
                "promotions": apply_result.promotions,
                "public_menu_url": _public_menu_url(ctx),
                "working_batch_products": count_batch_products(working),
                "working_batch_categories": len(working.categories),
                "working_batch_promotions": len(working.promotions),
                **_session_summary(session),
            }
            if reconciliation is not None:
                data["reconciliation"] = {
                    "new_categories": reconciliation.new_categories,
                    "reused_categories": reconciliation.reused_categories,
                    "new_products": reconciliation.new_products,
                    "updated_products": reconciliation.updated_products,
                }
            return ToolResult(ok=apply_result.ok, summary=apply_result.summary, data=data)

        if tool_name == "update_menu_knowledge":
            notes = args.get("notes")
            notes_text = str(notes).strip() if notes is not None else None
            section = _build_import_notes(session, notes_text)

            session.status = MenuImportSessionStatus.COMPLETED.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Completed import session with finalized notes",
                data={
                    "notes": section,
                    "notes_length": len(section),
                    **_session_summary(session),
                },
            )

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
