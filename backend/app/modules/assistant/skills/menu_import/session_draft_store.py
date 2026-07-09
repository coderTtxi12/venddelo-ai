"""Read/write OCR original, working draft, and open questions on import sessions."""

from __future__ import annotations

from typing import Any

from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportDraft,
    OpenQuestion,
)


def _parse_open_questions(raw: list[Any] | None) -> list[OpenQuestion]:
    questions: list[OpenQuestion] = []
    for entry in raw or []:
        if not isinstance(entry, dict):
            continue
        try:
            questions.append(OpenQuestion.model_validate(entry))
        except Exception:
            continue
    return questions


def list_open_questions(session: Any) -> list[OpenQuestion]:
    column_questions = _parse_open_questions(getattr(session, "open_questions", None))
    if column_questions:
        return column_questions

    pending: list[OpenQuestion] = []
    for entry in session.draft_batches or []:
        if not isinstance(entry, dict):
            continue
        try:
            batch = ImportBatch.model_validate(entry)
        except Exception:
            continue
        pending.extend(batch.open_questions)
    return pending


def set_open_questions(session: Any, questions: list[OpenQuestion]) -> None:
    session.open_questions = [question.model_dump() for question in questions]
    batches = list(session.draft_batches or [])
    if batches and isinstance(batches[0], dict):
        batch = ImportBatch.model_validate(batches[0])
        batches[0] = batch.model_copy(update={"open_questions": questions}).model_dump()
        session.draft_batches = batches


def get_working_batch(session: Any) -> ImportBatch | None:
    batches = session.draft_batches or []
    if not batches or not isinstance(batches[0], dict):
        return None
    try:
        return ImportBatch.model_validate(batches[0])
    except Exception:
        return None


def set_working_batch(session: Any, batch: ImportBatch) -> None:
    validated = ImportBatch.model_validate(batch.model_dump())
    session.draft_batches = [validated.model_dump()]
    session.open_questions = [question.model_dump() for question in validated.open_questions]


def validate_working_batch(session: Any) -> ImportBatch:
    batch = get_working_batch(session)
    if batch is None:
        raise ValueError("No working import draft in session")
    validated = ImportBatch.model_validate(batch.model_dump())
    empty_categories = [
        category.name for category in validated.categories if not category.products
    ]
    if empty_categories:
        names = ", ".join(empty_categories)
        raise ValueError(
            f"El borrador tiene categorías sin productos enlazados ({names}). "
            "Mueve los productos correspondientes a esas categorías en el borrador "
            "editable antes de aplicar."
        )
    return validated


def get_ocr_original(session: Any) -> ImportDraft | None:
    raw = getattr(session, "ocr_original", None)
    if not isinstance(raw, dict) or not raw:
        return None
    try:
        return ImportDraft.model_validate(raw)
    except Exception:
        return None


def set_ocr_original(session: Any, draft: ImportDraft) -> None:
    session.ocr_original = draft.model_dump()


def persist_extraction_snapshots(
    session: Any,
    *,
    ocr_original: ImportDraft,
    working_batch: ImportBatch,
) -> None:
    """Freeze literal OCR and initialize modeled working copy + questions."""
    set_ocr_original(session, ocr_original)
    set_working_batch(session, working_batch)


def unanswered_question_ids(session: Any) -> list[str]:
    answers = session.clarification_answers if isinstance(session.clarification_answers, dict) else {}
    unanswered: list[str] = []
    for question in list_open_questions(session):
        answer = answers.get(question.id)
        if answer is None or not str(answer).strip():
            unanswered.append(question.id)
    return unanswered
