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
from app.modules.assistant.skills.menu_import.session_draft_store import (
    persist_extraction_snapshots,
    validate_working_batch,
)
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.menu.service import MenuService


MENU_IMPORT_INTERNAL_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "start_menu_import_session",
        "get_import_session",
        "save_menu_context",
        "register_menu_source_file",
        "start_menu_extraction_batch",
        "get_extraction_status",
        "apply_full_import",
        "update_menu_knowledge",
    }
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
        return [
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
                    "Save owner-provided menu context BEFORE OCR (structure hints, category groupings, "
                    "naming conventions, promos). Injected into the extraction/mapping prompt."
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
                description=(
                    "Run OCR/vision extraction on all registered menu source files, persist ocr_original "
                    "and draft_batches, then apply the full menu to the live catalog in one step."
                ),
                effect="mutate",
                input_schema={"type": "object", "properties": {}, "required": []},
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
            ),
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
            ),
        ]

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
            literal: ImportDraft | None = None
            page_drafts: list[ImportDraft] = []
            for entry in _pending_source_files(source_files):
                path = str(entry.get("path") or "").strip()
                mime = str(entry.get("mime_type") or "").strip()
                if not path or not mime:
                    continue
                validate_import_asset_path(ctx.restaurant_id, path, kind="menu_source")
                payload = load_menu_source_from_storage(path, mime)
                if payload.pages:
                    ocr, modeled = extract_from_pages(payload.pages, context)
                elif payload.text:
                    ocr, modeled = extract_from_text(payload.text, context)
                else:
                    continue
                if literal is None:
                    literal = ocr
                else:
                    literal = merge_page_drafts([literal, ocr])
                page_drafts.append(modeled)
                entry["extracted_at"] = datetime.now(UTC).isoformat()

            merged = merge_page_drafts(page_drafts) if page_drafts else ImportDraft()
            merged = enrich_import_draft(merged)
            batch = single_batch_from_draft(merged)
            persist_extraction_snapshots(
                session,
                ocr_original=literal or ImportDraft(),
                working_batch=batch,
            )
            session.source_files = source_files
            _repo(ctx).update(session)

            product_count = count_batch_products(batch)
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
