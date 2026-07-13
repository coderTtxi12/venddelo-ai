"""Compact active-import-session summary for the workflow planner/executor."""

from __future__ import annotations

import uuid
from typing import Any

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.menu_import.batching import count_batch_products
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch
from app.modules.assistant.skills.menu_import.session_draft_store import (
    get_ocr_original,
    list_open_questions,
    unanswered_question_ids,
)
from app.modules.assistant.skills.menu_import.session_schemas import is_active_status


def build_owner_turn_tool_hint(
    user_message: str,
    session: Any | None,
) -> str | None:
    """Parse quiz answers / free-text instructions for the executor."""
    if session is None:
        return None
    from app.modules.assistant.skills.menu_import.clarification_input import (
        split_owner_turn_message,
    )
    from app.modules.assistant.skills.menu_import.session_draft_store import (
        get_ocr_original,
        list_open_questions,
    )

    if get_ocr_original(session) is None:
        return None

    answers, instructions = split_owner_turn_message(
        user_message,
        list_open_questions(session),
    )
    if not answers and not instructions:
        return None

    lines = [
        "## Owner turn (call model_working_draft)",
        "El dueño envió respuestas y/o instrucciones para reescribir el borrador OCR.",
    ]
    if answers:
        lines.append(f"- clarification_answers: {answers}")
    if instructions:
        lines.append(f"- owner_instructions: {instructions}")
    lines.append("- Llama `model_working_draft` con esos argumentos. No re-ejecutes OCR.")
    return "\n".join(lines)


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

    unanswered = len(unanswered_question_ids(session))
    live_snapshot = session.live_menu_snapshot or {}
    live_draft = live_snapshot.get("import_draft") if isinstance(live_snapshot, dict) else None

    lines = [
        f"Hay una **sesión de importación de menú ACTIVA** (fase: {session.status}).",
        f"- Productos en borrador editable (OCR copia): {product_total}",
        f"- OCR original congelado: {'sí' if getattr(session, 'ocr_original', None) else 'no'}",
        f"- Archivos fuente registrados: {source_files}",
        f"- Menú ya aplicado al live: {'sí' if applied else 'no'}",
        f"- Preguntas de aclaración pendientes: {unanswered}",
        f"- Snapshot menú live (ImportDraft): {'sí' if live_draft else 'no'}",
    ]
    if menu_context:
        preview = menu_context if len(menu_context) <= 240 else f"{menu_context[:239]}…"
        lines.append(f"- Contexto del dueño (pre-OCR): {preview}")

    return "\n".join(lines)


def _format_suggested_answers(labels: list[str]) -> str:
    visible: list[str] = []
    for raw in labels:
        label = raw.strip()
        if not label:
            continue
        if label.casefold() in {"otro", "otra", "other", "personalizado", "custom"}:
            continue
        visible.append(label)
    return ", ".join(visible) if visible else "(sin opciones sugeridas)"


def build_import_clarification_context(
    session: Any | None,
    *,
    user_message: str | None = None,
) -> str | None:
    """Quiz Q&A for the router — not persisted in chat history, lives on the session."""
    if session is None or not is_active_status(session.status):
        return None
    if get_ocr_original(session) is None:
        return None

    from app.modules.assistant.skills.menu_import.clarification_input import (
        split_owner_turn_message,
    )

    open_questions = list_open_questions(session)
    stored_answers = (
        session.clarification_answers if isinstance(session.clarification_answers, dict) else {}
    )
    pending_ids = set(unanswered_question_ids(session))
    pending_questions = [question for question in open_questions if question.id in pending_ids]

    parsed_answers: dict[str, str] = {}
    owner_instructions = ""
    if user_message:
        parsed_answers, owner_instructions = split_owner_turn_message(
            user_message,
            open_questions,
        )

    if (
        not open_questions
        and not stored_answers
        and not parsed_answers
        and not owner_instructions.strip()
    ):
        return None

    indexed = {question.id: question for question in open_questions}
    lines = [
        "## Aclaraciones de importación de menú",
        "Las preguntas del cuestionario también pueden aparecer en el historial del chat "
        "debajo del resumen del asistente; usa este bloque como fuente de verdad del turno actual.",
    ]

    if stored_answers:
        lines.append("### Respuestas ya registradas en la sesión")
        for question_id, answer in stored_answers.items():
            cleaned_answer = str(answer).strip()
            if not cleaned_answer:
                continue
            question = indexed.get(question_id)
            prompt_question = question.question_es if question else question_id
            lines.append(f"- [{question_id}] {prompt_question} → {cleaned_answer}")

    if pending_questions:
        lines.append("### Preguntas pendientes (cuestionario en UI)")
        for index, question in enumerate(pending_questions, start=1):
            lines.append(f"{index}. [{question.id}] {question.question_es}")
            lines.append(f"   Opciones: {_format_suggested_answers(question.suggested_answers)}")

    if parsed_answers:
        lines.append("### Respuestas detectadas en el mensaje actual")
        for question_id, answer in parsed_answers.items():
            question = indexed.get(question_id)
            prompt_question = question.question_es if question else question_id
            lines.append(f"- [{question_id}] {prompt_question} → {answer}")

    if owner_instructions.strip():
        lines.append("### Instrucciones adicionales en el mensaje actual")
        lines.append(owner_instructions.strip())

    if pending_questions or parsed_answers or owner_instructions.strip():
        lines.append(
            "### Routing hint\n"
            "El dueño está aclarando o editando el **borrador OCR** de importación. "
            "Ruta **menu_import** (tool `model_working_draft`), no `executor` del menú live."
        )

    return "\n".join(lines)


def build_full_import_session_context(
    session: Any | None,
    *,
    user_message: str | None = None,
) -> str | None:
    parts: list[str] = []
    base = build_import_session_context(session)
    if base:
        parts.append(base)
    clarification = build_import_clarification_context(session, user_message=user_message)
    if clarification:
        parts.append(clarification)
    if user_message:
        owner_hint = build_owner_turn_tool_hint(user_message, session)
        if owner_hint:
            parts.append(owner_hint)
    return "\n\n".join(parts) if parts else None
