"""menu_import skill — full digital menu onboarding from uploaded documents."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.import_assets import validate_import_asset_path
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_import.apply_batch import apply_full_import
from app.modules.assistant.skills.menu_import.batching import (
    count_batch_products,
    single_batch_from_draft,
)
from app.modules.assistant.skills.menu_import.draft_merge import merge_draft_batches
from app.modules.assistant.skills.menu_import.clarification import apply_clarification_answers
from app.modules.assistant.skills.menu_import.complement_questions import (
    build_complement_questions,
    merge_open_questions,
)
from app.modules.assistant.skills.menu_import.live_menu_cache import capture_live_menu_snapshot
from app.modules.assistant.skills.menu_import.menu_reconcile import (
    ReconciliationPlan,
    build_reconciliation_plan,
    reconciliation_plan_from_dict,
    reconciliation_plan_to_dict,
)
from app.modules.assistant.skills.menu_import.merchandising import (
    apply_import_merchandising_draft,
    new_category_refs,
)
from app.modules.assistant.skills.menu_import.preview_full import build_full_import_preview
from app.modules.assistant.skills.menu_import.document_loader import load_menu_source_from_storage
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft
from app.modules.assistant.skills.menu_import.extraction import (
    extract_from_pages,
    extract_from_text,
    merge_page_drafts,
)
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.menu.service import MenuService


MENU_IMPORT_INTERNAL_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "start_menu_import_session",
        "get_import_session",
        "save_discovery_answers",
        "register_menu_source_file",
        "start_menu_extraction_batch",
        "get_extraction_status",
        "analyze_import_vs_live",
        "save_clarification_answers",
        "preview_full_import",
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
    return {
        "discovery_answers": session.discovery_answers or {},
        "clarification_answers": session.clarification_answers or {},
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
    return {
        "session_id": str(session.id),
        "status": session.status,
        "source_files": len(session.source_files or []),
        "draft_batches_total": len(batches),
        "draft_batches_applied": applied,
        "draft_batches_pending": pending,
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

    if batch.open_questions:
        lines.append("**Preguntas abiertas:**")
        for question in batch.open_questions:
            lines.append(f"- [{question.id}] {question.question_es}")
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


def _build_import_notes(session: MenuImportSession, notes: str | None) -> str:
    parts: list[str] = ["## Notas de importación", ""]
    if notes and notes.strip():
        parts.append(notes.strip())
        parts.append("")

    discovery = session.discovery_answers or {}
    if discovery:
        parts.append("### Contexto del restaurante")
        parts.append(json.dumps(discovery, ensure_ascii=False, indent=2))
        parts.append("")

    clarification = session.clarification_answers or {}
    if clarification:
        parts.append("### Reglas confirmadas")
        for key, value in clarification.items():
            parts.append(f"- **{key}**: {value}")
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
                name="save_discovery_answers",
                description=(
                    "Persist initial discovery questionnaire answers (cuisine, currency, promo rules) "
                    "and advance to collecting menu source files."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "answers": {
                            "type": "object",
                            "description": "Key-value discovery answers from the owner.",
                        },
                    },
                    "required": ["answers"],
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
                    "Run OCR/vision extraction on all registered menu source files and store "
                    "the ENTIRE menu as one draft (categories, products, complements, promotions). "
                    "Runs synchronously in-process."
                ),
                effect="mutate",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="get_extraction_status",
                description=(
                    "Read extraction progress: batch counts, applied vs pending, and open questions."
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
                name="analyze_import_vs_live",
                description=(
                    "Compare the OCR import draft against the restaurant live menu. "
                    "Caches live_menu_snapshot and reconciliation_snapshot in Postgres "
                    "so later turns do not re-scan the live menu. Merges complement "
                    "clarification questions into open_questions for batch asking."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "force_refresh": {
                            "type": "boolean",
                            "description": (
                                "Set true to refresh the live menu snapshot even if one exists."
                            ),
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="save_clarification_answers",
                description=(
                    "Save owner answers to open_questions from extraction. "
                    "Advances to preview when all questions are answered."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "answers": {
                            "type": "object",
                            "description": "Map of question_id → answer text.",
                        },
                    },
                    "required": ["answers"],
                },
            ),
            ToolDefinition(
                name="preview_full_import",
                description=(
                    "Executive markdown preview of the full menu as extracted (prices in MXN), "
                    "including complement groups with required/optional and min/max."
                ),
                effect="read",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="apply_full_import",
                description=(
                    "Apply ALL pending import batches in one call. Requires confirmed=true and "
                    "no unanswered open_questions."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "confirmed": {
                            "type": "boolean",
                            "description": "Owner must confirm before applying.",
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

        if tool_name == "save_discovery_answers":
            answers = args.get("answers")
            if not isinstance(answers, dict) or not answers:
                return ToolResult(ok=False, summary="answers must be a non-empty object")
            session.discovery_answers = answers
            session.status = MenuImportSessionStatus.COLLECTING_SOURCES.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Saved discovery answers",
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

            if session.draft_batches:
                batches = _batch_entries(session)
                batch = ImportBatch.model_validate(batches[0]) if batches else None
                product_count = count_batch_products(batch) if batch is not None else 0
                return ToolResult(
                    ok=True,
                    summary=f"Reusing existing extraction ({product_count} product(s))",
                    data={
                        **_session_summary(session),
                        "open_questions": [
                            q.model_dump()
                            for q in (batch.open_questions if batch is not None else [])
                        ],
                    },
                )

            context = _extraction_context(session)
            page_drafts: list[ImportDraft] = []
            for entry in _pending_source_files(source_files):
                path = str(entry.get("path") or "").strip()
                mime = str(entry.get("mime_type") or "").strip()
                if not path or not mime:
                    continue
                validate_import_asset_path(ctx.restaurant_id, path, kind="menu_source")
                payload = load_menu_source_from_storage(path, mime)
                if payload.pages:
                    page_drafts.append(extract_from_pages(payload.pages, context))
                elif payload.text:
                    page_drafts.append(extract_from_text(payload.text, context))
                entry["extracted_at"] = datetime.now(UTC).isoformat()

            merged = merge_page_drafts(page_drafts) if page_drafts else ImportDraft()
            batch = single_batch_from_draft(merged)
            session.draft_batches = [batch.model_dump()]
            session.source_files = source_files
            session.status = (
                MenuImportSessionStatus.CLARIFYING.value
                if merged.open_questions
                else MenuImportSessionStatus.PREVIEW_BATCH.value
            )
            _repo(ctx).update(session)
            product_count = count_batch_products(batch)
            return ToolResult(
                ok=True,
                summary=(
                    f"Extracted {product_count} product(s) as one full menu"
                ),
                data={
                    **_session_summary(session),
                    "open_questions": [q.model_dump() for q in merged.open_questions],
                    "global_rules": merged.global_rules,
                },
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
                        "open_questions": len(batch.get("open_questions") or []),
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

        if tool_name == "analyze_import_vs_live":
            batches = _batch_entries(session)
            if not batches:
                return ToolResult(ok=False, summary="Run extraction before analyzing vs live menu")

            force_refresh = bool(args.get("force_refresh", False))
            live_snapshot = dict(session.live_menu_snapshot or {})
            if force_refresh or not live_snapshot.get("captured_at"):
                live_snapshot = capture_live_menu_snapshot(ctx)
                session.live_menu_snapshot = live_snapshot

            merged = merge_draft_batches(
                [ImportBatch.model_validate(entry) for entry in batches]
            )
            plan = _current_reconciliation(ctx, merged)
            session.reconciliation_snapshot = reconciliation_plan_to_dict(plan)

            merged = merge_open_questions(merged, build_complement_questions(merged, plan))
            optimized_batch = single_batch_from_draft(merged)
            session.draft_batches = [optimized_batch.model_dump()]
            session.status = (
                MenuImportSessionStatus.CLARIFYING.value
                if merged.open_questions
                else MenuImportSessionStatus.PREVIEW_BATCH.value
            )
            _repo(ctx).update(session)

            unanswered = [question.model_dump() for question in merged.open_questions]
            return ToolResult(
                ok=True,
                summary=(
                    f"Analyzed import vs live menu; {len(unanswered)} open question(s)"
                    if unanswered
                    else "Analyzed import vs live menu; no open questions"
                ),
                data={
                    **_session_summary(session),
                    "live_menu_counts": (live_snapshot.get("counts") or {}),
                    "reconciliation": {
                        "new_categories": plan.new_categories,
                        "reused_categories": plan.reused_categories,
                        "new_products": plan.new_products,
                        "updated_products": plan.updated_products,
                        "products_with_existing_groups": sorted(plan.products_with_existing_groups),
                    },
                    "open_questions": unanswered,
                    "reconciliation_markdown": plan.markdown,
                },
            )

        if tool_name == "save_clarification_answers":
            answers = args.get("answers")
            if not isinstance(answers, dict) or not answers:
                return ToolResult(ok=False, summary="answers must be a non-empty object")
            unanswered = apply_clarification_answers(session, answers)
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Saved clarification answers",
                data={**_session_summary(session), "unanswered_question_ids": unanswered},
            )

        if tool_name == "preview_full_import":
            merged = merge_draft_batches(
                [ImportBatch.model_validate(entry) for entry in _batch_entries(session)]
            )
            plan = _current_reconciliation(ctx, merged)
            merchandised = apply_import_merchandising_draft(
                merged,
                new_category_refs=new_category_refs(merged.categories, plan),
            )
            preview_markdown = build_full_import_preview(merchandised)
            cached = reconciliation_plan_from_dict(session.reconciliation_snapshot or {})
            plan_markdown = cached.markdown if cached is not None and cached.markdown else plan.markdown
            markdown = f"{plan_markdown}\n\n{preview_markdown}"
            return ToolResult(
                ok=True,
                summary="Full import preview ready",
                data={
                    "markdown": markdown,
                    "reconciliation": {
                        "new_categories": plan.new_categories,
                        "reused_categories": plan.reused_categories,
                        "new_products": plan.new_products,
                        "updated_products": plan.updated_products,
                    },
                    "open_questions": [question.model_dump() for question in merged.open_questions],
                },
            )

        if tool_name == "apply_full_import":
            confirmed = bool(args.get("confirmed", False))
            reconciliation: ReconciliationPlan | None = None
            if confirmed:
                merged_draft = merge_draft_batches(
                    [ImportBatch.model_validate(entry) for entry in _batch_entries(session)]
                )
                reconciliation = _current_reconciliation(ctx, merged_draft)
            result = apply_full_import(
                ctx, session, confirmed=confirmed, reconciliation=reconciliation
            )
            if result.ok:
                session.status = MenuImportSessionStatus.ENRICHING.value
                _repo(ctx).update(session)
            data: dict[str, Any] = {
                "batches_applied": result.batches_applied,
                "categories": result.categories,
                "products": result.products,
                "option_groups": result.option_groups,
                "option_items": result.option_items,
                "promotions": result.promotions,
                **_session_summary(session),
            }
            if reconciliation is not None:
                data["reconciliation"] = {
                    "new_categories": reconciliation.new_categories,
                    "reused_categories": reconciliation.reused_categories,
                    "new_products": reconciliation.new_products,
                    "updated_products": reconciliation.updated_products,
                }
            return ToolResult(ok=result.ok, summary=result.summary, data=data)

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
