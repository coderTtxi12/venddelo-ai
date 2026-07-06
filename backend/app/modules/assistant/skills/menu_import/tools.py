"""menu_import skill — full digital menu onboarding from uploaded documents."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.import_assets import validate_import_asset_path
from app.modules.assistant.profile.menu_markdown import menu_markdown_for_persist
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_import.apply_batch import apply_full_import, apply_import_batch
from app.modules.assistant.skills.menu_import.batching import count_batch_products, split_draft_into_batches
from app.modules.assistant.skills.menu_import.draft_merge import merge_draft_batches
from app.modules.assistant.skills.menu_import.optimization import optimize_draft
from app.modules.assistant.skills.menu_import.preview_full import build_full_import_preview
from app.modules.assistant.skills.menu_write.theme_tools import list_menu_themes, recommend_menu_theme
from app.modules.assistant.skills.menu_import.description_enhance import (
    apply_description_enhancements,
    preview_description_enhancements,
)
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
        "product_images": len(session.product_images or []),
        "draft_batches_total": len(batches),
        "draft_batches_applied": applied,
        "draft_batches_pending": pending,
        "selected_theme_id": session.selected_theme_id,
        "enhance_descriptions": session.enhance_descriptions,
        "enhance_images": session.enhance_images,
        "uncertain_images": len(session.uncertain_images or []),
        "unmatched_images": len(session.unmatched_images or []),
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


def _accumulated_product_ids(session: MenuImportSession) -> dict[str, uuid.UUID]:
    merged: dict[str, uuid.UUID] = {}
    for batch in _batch_entries(session):
        if not batch.get("applied_at"):
            continue
        raw_map = batch.get("ref_map") or {}
        if not isinstance(raw_map, dict):
            continue
        for ref, value in raw_map.items():
            if not str(ref).startswith("prod_"):
                continue
            try:
                merged[str(ref)] = uuid.UUID(str(value))
            except (TypeError, ValueError):
                continue
    return merged


class MenuImportSkill:
    id = "menu_import"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="start_menu_import_session",
                description=(
                    "Start a new menu import onboarding session for this restaurant. "
                    "Cancels any previous active session when confirm_cancel_previous=true."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "confirm_cancel_previous": {
                            "type": "boolean",
                            "description": (
                                "Set true to cancel an existing active session before creating a new one."
                            ),
                            "default": False,
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
                    "Run OCR/vision extraction on all registered menu source files. "
                    "Splits the merged draft into batches (max 15 products each) and stores them "
                    "in the session. Runs synchronously in-process."
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
                name="save_clarification_answers",
                description=(
                    "Save owner answers to open_questions from extraction. "
                    "Advances to optimizing when all questions are answered."
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
                name="optimize_import_draft",
                description=(
                    "Merge all extraction batches, optimize order/layout/copy/complement rules "
                    "(required/optional, min/max selections), recommend theme, and rewrite draft_batches."
                ),
                effect="mutate",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="preview_full_import",
                description=(
                    "Executive markdown preview of the full optimized menu (prices in MXN), "
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
                name="preview_import_batch",
                description=(
                    "Preview one import batch as a markdown-friendly table for owner confirmation."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"batch_index": {"type": "integer"}},
                    "required": ["batch_index"],
                },
            ),
            ToolDefinition(
                name="apply_menu_batch",
                description=(
                    "Materialize categories, products, option groups, and promotions from one batch. "
                    "Requires confirmed=true and all open_questions answered."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "batch_index": {"type": "integer"},
                        "confirmed": {
                            "type": "boolean",
                            "description": "Owner must confirm before applying.",
                            "default": False,
                        },
                    },
                    "required": ["batch_index"],
                },
            ),
            ToolDefinition(
                name="preview_description_enhancements",
                description=(
                    "Generate LLM proposals for improved product descriptions (read-only preview)."
                ),
                effect="read",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="apply_description_enhancements",
                description=(
                    "Apply approved description enhancements via bulk update. "
                    "Requires confirmed=true."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "confirmed": {"type": "boolean", "default": False},
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "description": {"type": "string"},
                                },
                                "required": ["product_id", "description"],
                            },
                            "description": (
                                "Optional explicit items; omit to apply the latest preview."
                            ),
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="request_image_enhancement",
                description=(
                    "List imported products without images, eligible for menu_media image generation."
                ),
                effect="read",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="update_menu_knowledge",
                description=(
                    "Append import notes to the restaurant menu_markdown knowledge block "
                    "and mark the import session completed."
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
            confirm = bool(args.get("confirm_cancel_previous", False))
            repo = _repo(ctx)
            active = repo.get_active_for_restaurant(ctx.restaurant_id)
            if active is not None and not confirm:
                return ToolResult(
                    ok=False,
                    summary=(
                        "An active import session already exists; "
                        "pass confirm_cancel_previous=true to replace it"
                    ),
                    data=_session_summary(active),
                )
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

            context = _extraction_context(session)
            page_drafts: list[ImportDraft] = []
            for entry in source_files:
                if not isinstance(entry, dict):
                    continue
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

            merged = merge_page_drafts(page_drafts) if page_drafts else ImportDraft()
            batches = split_draft_into_batches(merged)
            session.draft_batches = [batch.model_dump() for batch in batches]
            session.status = (
                MenuImportSessionStatus.CLARIFYING.value
                if merged.open_questions
                else MenuImportSessionStatus.OPTIMIZING.value
            )
            _repo(ctx).update(session)
            product_count = sum(count_batch_products(batch) for batch in batches)
            return ToolResult(
                ok=True,
                summary=(
                    f"Extracted {product_count} product(s) into {len(batches)} batch(es)"
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

        if tool_name == "save_clarification_answers":
            answers = args.get("answers")
            if not isinstance(answers, dict) or not answers:
                return ToolResult(ok=False, summary="answers must be a non-empty object")
            merged_answers = dict(session.clarification_answers or {})
            merged_answers.update(answers)
            session.clarification_answers = merged_answers

            unanswered: list[str] = []
            for batch in _batch_entries(session):
                batch_model = ImportBatch.model_validate(batch)
                for question in batch_model.open_questions:
                    answer = merged_answers.get(question.id)
                    if answer is None or not str(answer).strip():
                        unanswered.append(question.id)

            if unanswered:
                session.status = MenuImportSessionStatus.CLARIFYING.value
            else:
                session.status = MenuImportSessionStatus.OPTIMIZING.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Saved clarification answers",
                data={**_session_summary(session), "unanswered_question_ids": unanswered},
            )

        if tool_name == "optimize_import_draft":
            batches = [ImportBatch.model_validate(entry) for entry in _batch_entries(session)]
            if not batches:
                return ToolResult(ok=False, summary="Run extraction before optimizing")
            merged = merge_draft_batches(batches)
            opt = optimize_draft(merged, _extraction_context(session))
            theme_id = opt.recommended_theme_id
            if not theme_id:
                recs = recommend_menu_theme(ctx, session=session)
                if recs:
                    theme_id = recs[0].theme_id
            if theme_id:
                session.selected_theme_id = theme_id
            discovery = dict(session.discovery_answers or {})
            discovery["concierge_mode"] = True
            discovery["optimization_notes_es"] = opt.optimization_notes_es
            session.discovery_answers = discovery
            optimized_batches = split_draft_into_batches(opt.draft)
            session.draft_batches = [batch.model_dump() for batch in optimized_batches]
            session.status = MenuImportSessionStatus.PREVIEW_BATCH.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Optimized import draft for full preview",
                data={
                    "optimization_notes_es": opt.optimization_notes_es,
                    "recommended_theme_id": theme_id,
                    "product_count": sum(count_batch_products(batch) for batch in optimized_batches),
                    **_session_summary(session),
                },
            )

        if tool_name == "preview_full_import":
            merged = merge_draft_batches(
                [ImportBatch.model_validate(entry) for entry in _batch_entries(session)]
            )
            discovery = session.discovery_answers or {}
            notes = discovery.get("optimization_notes_es") or []
            theme_id = session.selected_theme_id
            theme_label = theme_id
            if theme_id:
                themes = {entry["id"]: entry.get("label", entry["id"]) for entry in list_menu_themes(ctx)}
                theme_label = themes.get(theme_id, theme_id)
            markdown = build_full_import_preview(
                merged,
                optimization_notes_es=notes if isinstance(notes, list) else [],
                recommended_theme_id=theme_id,
                theme_label=theme_label,
            )
            return ToolResult(
                ok=True,
                summary="Full import preview ready",
                data={
                    "markdown": markdown,
                    "open_questions": [question.model_dump() for question in merged.open_questions],
                },
            )

        if tool_name == "apply_full_import":
            confirmed = bool(args.get("confirmed", False))
            result = apply_full_import(ctx, session, confirmed=confirmed)
            if result.ok:
                session.status = MenuImportSessionStatus.MATCHING_IMAGES.value
                _repo(ctx).update(session)
            return ToolResult(
                ok=result.ok,
                summary=result.summary,
                data={
                    "batches_applied": result.batches_applied,
                    "categories": result.categories,
                    "products": result.products,
                    "option_groups": result.option_groups,
                    "option_items": result.option_items,
                    "promotions": result.promotions,
                    **_session_summary(session),
                },
            )

        if tool_name == "preview_import_batch":
            batch_index = args.get("batch_index")
            if batch_index is None:
                return ToolResult(ok=False, summary="batch_index is required")
            index = int(batch_index)
            batches = _batch_entries(session)
            if index < 0 or index >= len(batches):
                return ToolResult(ok=False, summary=f"Batch index {index} not found")
            batch = ImportBatch.model_validate(batches[index])
            return ToolResult(
                ok=True,
                summary=f"Preview for batch {index}",
                data={
                    "batch_index": index,
                    "markdown": _preview_batch_markdown(batch),
                    "product_count": count_batch_products(batch),
                    "open_questions": [q.model_dump() for q in batch.open_questions],
                    "batch": batch.model_dump(),
                },
            )

        if tool_name == "apply_menu_batch":
            batch_index = args.get("batch_index")
            if batch_index is None:
                return ToolResult(ok=False, summary="batch_index is required")
            confirmed = bool(args.get("confirmed", False))
            result = apply_import_batch(ctx, session, int(batch_index), confirmed=confirmed)
            if result.ok:
                batches = _batch_entries(session)
                pending = sum(1 for batch in batches if not batch.get("applied_at"))
                session.status = (
                    MenuImportSessionStatus.MATCHING_IMAGES.value
                    if pending == 0
                    else MenuImportSessionStatus.APPLYING.value
                )
                _repo(ctx).update(session)
            return ToolResult(
                ok=result.ok,
                summary=result.summary,
                data={
                    "categories": result.categories,
                    "products": result.products,
                    "option_groups": result.option_groups,
                    "option_items": result.option_items,
                    "promotions": result.promotions,
                    "ref_map": result.ref_map,
                    **_session_summary(session),
                },
            )

        if tool_name == "preview_description_enhancements":
            enhancements = preview_description_enhancements(session, ctx)
            session.enhance_descriptions = True
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary=f"Generated {len(enhancements)} description proposal(s)",
                data={
                    "enhancements": [
                        {
                            "product_id": item.product_id,
                            "current": item.current,
                            "proposed": item.proposed,
                        }
                        for item in enhancements
                    ]
                },
            )

        if tool_name == "apply_description_enhancements":
            confirmed = bool(args.get("confirmed", False))
            raw_items = args.get("items")
            enhancements = None
            if isinstance(raw_items, list) and raw_items:
                from app.modules.assistant.skills.menu_import.description_enhance import (
                    DescriptionEnhancement,
                )

                enhancements = [
                    DescriptionEnhancement(
                        product_id=str(item["product_id"]),
                        current=None,
                        proposed=str(item["description"]),
                    )
                    for item in raw_items
                    if isinstance(item, dict) and item.get("product_id") and item.get("description")
                ]
            result = apply_description_enhancements(
                session,
                ctx,
                confirmed=confirmed,
                enhancements=enhancements,
            )
            if result.ok:
                session.status = MenuImportSessionStatus.ENRICHING.value
                _repo(ctx).update(session)
            return result

        if tool_name == "request_image_enhancement":
            ref_map = _accumulated_product_ids(session)
            if not ref_map:
                return ToolResult(
                    ok=False,
                    summary="Apply at least one batch before listing products for image enhancement",
                )
            menu = MenuService(ctx.uow.menu)
            without_images: list[dict[str, str]] = []
            for ref, product_id in ref_map.items():
                product = menu.get_product_by_id(ctx.restaurant_id, product_id)
                if not product.image_path:
                    without_images.append(
                        {
                            "product_ref": ref,
                            "product_id": str(product.id),
                            "name": product.name,
                        }
                    )
            session.enhance_images = True
            session.status = MenuImportSessionStatus.ENRICHING.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary=f"Found {len(without_images)} product(s) without images",
                data={
                    "products_without_images": without_images,
                    "use_skill": "menu_media",
                    "tools": [
                        "menu_media__generate_product_image",
                        "menu_write__match_product_photos",
                        "menu_write__assign_product_image",
                        "menu_write__bulk_assign_product_images",
                    ],
                    **_session_summary(session),
                },
            )

        if tool_name == "update_menu_knowledge":
            notes = args.get("notes")
            notes_text = str(notes).strip() if notes is not None else None
            section = _build_import_notes(session, notes_text)

            profile = ctx.uow.assistant_profiles.get(ctx.restaurant_id)
            if profile is None:
                return ToolResult(ok=False, summary="Assistant profile not found")

            current = (profile.menu_markdown or "").strip()
            updated = f"{current}\n\n{section}".strip() if current else section
            updated_record = ctx.uow.assistant_profiles.update(
                ctx.restaurant_id,
                expected_version=profile.version,
                menu_markdown=menu_markdown_for_persist(updated),
            )
            if updated_record is None:
                return ToolResult(ok=False, summary="Profile version mismatch — refresh and retry")

            session.status = MenuImportSessionStatus.COMPLETED.value
            _repo(ctx).update(session)
            return ToolResult(
                ok=True,
                summary="Updated menu knowledge and completed import session",
                data={
                    "menu_markdown_length": len(updated),
                    **_session_summary(session),
                },
            )

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
