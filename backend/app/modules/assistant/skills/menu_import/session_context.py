"""Compact active-import-session summary for the workflow planner/executor."""

from __future__ import annotations

from typing import Any

from app.modules.assistant.skills.menu_import.batching import count_batch_products
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch
from app.modules.assistant.skills.menu_import.session_schemas import is_active_status

_MAX_QUESTIONS_SHOWN = 20


def _pending_questions(
    draft_batches: list[Any] | None,
    answers: dict[str, Any] | None,
) -> list[tuple[str, str]]:
    resolved_answers = answers if isinstance(answers, dict) else {}
    pending: list[tuple[str, str]] = []
    for entry in draft_batches or []:
        if not isinstance(entry, dict):
            continue
        try:
            batch = ImportBatch.model_validate(entry)
        except Exception:
            continue
        for question in batch.open_questions:
            existing = resolved_answers.get(question.id)
            if existing is None or not str(existing).strip():
                pending.append((question.id, question.question_es))
    return pending


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


def build_import_session_context(session: Any | None) -> str | None:
    """Human-readable Spanish summary of an active menu import session, or None."""
    if session is None or not is_active_status(session.status):
        return None

    product_total = _product_total(session.draft_batches)
    source_files = len(session.source_files or [])
    pending = _pending_questions(session.draft_batches, session.clarification_answers or {})

    lines = [
        f"Hay una **sesión de importación de menú ACTIVA** (fase: {session.status}).",
        f"- Productos extraídos por OCR: {product_total}",
        f"- Archivos fuente registrados: {source_files}",
        f"- Preguntas de aclaración pendientes: {len(pending)}",
    ]
    if pending:
        lines.append(
            "- Preguntas pendientes (el mensaje del usuario probablemente las responde):"
        )
        for question_id, text in pending[:_MAX_QUESTIONS_SHOWN]:
            lines.append(f"  - [{question_id}] {text}")
        remaining = len(pending) - _MAX_QUESTIONS_SHOWN
        if remaining > 0:
            lines.append(f"  - … y {remaining} más")

    return "\n".join(lines)
