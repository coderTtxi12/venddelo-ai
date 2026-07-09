"""Compact active-import-session summary for the workflow planner/executor."""

from __future__ import annotations

import uuid
from typing import Any

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.menu_import.batching import count_batch_products
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch
from app.modules.assistant.skills.menu_import.session_schemas import is_active_status


def _product_total(draft_batches: list[Any] | None) -> int:
    total = 0
    for entry in draft_batches or []:
        if not isinstance(entry, dict):
            continue
        try:
            total += count_batch_products(ImportBatch.model_validate(entry))
        except Exception:
            continue
    return total


def get_active_import_for_conversation(
    uow: SqlAlchemyUnitOfWork,
    *,
    restaurant_id: uuid.UUID,
    conversation_id: uuid.UUID,
    fresh: bool = False,
) -> Any | None:
    """Return the active import session only when it belongs to this chat conversation."""
    active = uow.menu_import_sessions.get_active_for_restaurant(restaurant_id)
    if active is None or active.conversation_id != conversation_id:
        return None
    if fresh:
        uow.session.refresh(active)
    return active


def cancel_active_import_for_restaurant(
    uow: SqlAlchemyUnitOfWork,
    *,
    restaurant_id: uuid.UUID,
) -> bool:
    active = uow.menu_import_sessions.get_active_for_restaurant(restaurant_id)
    if active is None:
        return False
    uow.menu_import_sessions.cancel_active(restaurant_id)
    return True


def build_import_session_context(session: Any | None) -> str | None:
    """Human-readable Spanish summary of an active menu import session, or None."""
    if session is None or not is_active_status(session.status):
        return None

    product_total = _product_total(session.draft_batches)
    source_files = len(session.source_files or [])
    discovery = session.discovery_answers or {}
    menu_context = str(discovery.get("menu_context") or "").strip()
    batches = session.draft_batches or []
    applied = any(
        isinstance(entry, dict) and entry.get("applied_at") for entry in batches
    )

    lines = [
        f"Hay una **sesión de importación de menú ACTIVA** (fase: {session.status}).",
        f"- Productos en borrador editable (OCR copia): {product_total}",
        f"- OCR original congelado: {'sí' if getattr(session, 'ocr_original', None) else 'no'}",
        f"- Archivos fuente registrados: {source_files}",
        f"- Menú ya aplicado al live: {'sí' if applied else 'no'}",
    ]
    if menu_context:
        preview = menu_context if len(menu_context) <= 240 else f"{menu_context[:239]}…"
        lines.append(f"- Contexto del dueño (pre-OCR): {preview}")

    return "\n".join(lines)
