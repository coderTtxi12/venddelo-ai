"""Parse, resolve, and persist menu-import clarification answers."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, OpenQuestion
from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizOption,
    MenuImportQuizQuestion,
    MenuImportUserResponse,
)
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus

_CLARIFICATION_HEADER_RE = re.compile(r"respuestas de aclaraci[oó]n", re.IGNORECASE)
_ANSWER_LINE_RE = re.compile(
    r"^\s*[-*]\s*(?:\[(?P<id>[^\]]+)\]|(?P<id2>[^:]+?))\s*:\s*(?P<answer>.+?)\s*$",
    re.MULTILINE,
)
_JSON_FENCE_RE = re.compile(
    r"```(?:json|menu_import_clarification)?\s*(\{.*?\})\s*```",
    re.DOTALL | re.IGNORECASE,
)
_INDEX_KEY_RE = re.compile(r"^(?:q(?:uestion)?[_-]?)?(\d+)$", re.IGNORECASE)


def get_unanswered_open_questions(session: Any) -> list[OpenQuestion]:
    answers = session.clarification_answers if isinstance(session.clarification_answers, dict) else {}
    pending: list[OpenQuestion] = []
    for entry in session.draft_batches or []:
        if not isinstance(entry, dict):
            continue
        try:
            batch = ImportBatch.model_validate(entry)
        except Exception:
            continue
        for question in batch.open_questions:
            existing = answers.get(question.id)
            if existing is None or not str(existing).strip():
                pending.append(question)
    return pending


def parse_clarification_answers_from_message(text: str) -> dict[str, str] | None:
    if not text or not text.strip():
        return None

    has_header = _CLARIFICATION_HEADER_RE.search(text) is not None
    answers: dict[str, str] = {}

    for match in _ANSWER_LINE_RE.finditer(text):
        question_id = (match.group("id") or match.group("id2") or "").strip()
        answer = (match.group("answer") or "").strip()
        if question_id and answer:
            answers[question_id] = answer

    for match in _JSON_FENCE_RE.finditer(text):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        block = payload.get("menu_import_clarification")
        if isinstance(block, dict):
            payload = block
        raw_answers = payload.get("answers")
        if isinstance(raw_answers, dict):
            for key, value in raw_answers.items():
                text_value = str(value).strip()
                if text_value:
                    answers[str(key).strip()] = text_value

    if not answers and not has_header:
        return None
    return answers or None


def _question_index(key: str) -> int | None:
    match = _INDEX_KEY_RE.match(key.strip())
    if match is None:
        return None
    return int(match.group(1)) - 1


def resolve_clarification_answers(
    raw_answers: dict[str, str],
    pending_questions: list[OpenQuestion],
) -> dict[str, str]:
    if not raw_answers or not pending_questions:
        return {}

    pending_ids = {question.id for question in pending_questions}
    resolved: dict[str, str] = {}

    for key, value in raw_answers.items():
        answer = str(value).strip()
        if not answer:
            continue
        if key in pending_ids:
            resolved[key] = answer

    for key, value in raw_answers.items():
        answer = str(value).strip()
        if not answer:
            continue
        index = _question_index(key)
        if index is None or index < 0 or index >= len(pending_questions):
            continue
        question_id = pending_questions[index].id
        resolved.setdefault(question_id, answer)

    if len(pending_questions) == 1 and len(raw_answers) == 1 and not resolved:
        only_answer = next(iter(raw_answers.values())).strip()
        if only_answer:
            resolved[pending_questions[0].id] = only_answer

    return resolved


def apply_clarification_answers(session: Any, answers: dict[str, str]) -> list[str]:
    merged_answers = dict(session.clarification_answers or {})
    merged_answers.update(answers)
    session.clarification_answers = merged_answers

    unanswered: list[str] = []
    for entry in session.draft_batches or []:
        if not isinstance(entry, dict):
            continue
        batch = ImportBatch.model_validate(entry)
        for question in batch.open_questions:
            answer = merged_answers.get(question.id)
            if answer is None or not str(answer).strip():
                unanswered.append(question.id)

    if unanswered:
        session.status = MenuImportSessionStatus.CLARIFYING.value
    else:
        session.status = MenuImportSessionStatus.PREVIEW_BATCH.value
    return unanswered


def try_apply_clarification_from_user_message(
    *,
    uow: SqlAlchemyUnitOfWork,
    restaurant_id: uuid.UUID,
    user_message: str,
) -> bool:
    raw_answers = parse_clarification_answers_from_message(user_message)
    if not raw_answers:
        return False

    repo = MenuImportSessionRepository(uow.session)
    session = repo.get_active_for_restaurant(restaurant_id)
    if session is None:
        return False

    pending = get_unanswered_open_questions(session)
    if not pending:
        return False

    resolved = resolve_clarification_answers(raw_answers, pending)
    if not resolved:
        return False

    apply_clarification_answers(session, resolved)
    repo.update(session)
    uow.commit()
    return True


def _normalize_question_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned and not cleaned.endswith("?"):
        return f"{cleaned}?"
    return cleaned


def _fallback_suggestions(question: OpenQuestion) -> list[MenuImportQuizOption]:
    lowered = question.question_es.lower()
    if "ignor" in lowered:
        return [
            MenuImportQuizOption(id="opt_description", label="Usar como descripción"),
            MenuImportQuizOption(id="opt_constraints", label="Usar como notas de restricción"),
            MenuImportQuizOption(id="opt_ignore", label="Ignorar"),
        ]
    return [
        MenuImportQuizOption(id="opt_yes", label="Sí"),
        MenuImportQuizOption(id="opt_no", label="No"),
    ]


def hydrate_menu_import_response(
    response: MenuImportUserResponse,
    session: Any | None,
) -> MenuImportUserResponse:
    if session is None:
        return response

    pending = get_unanswered_open_questions(session)
    has_open_questions = False
    for entry in session.draft_batches or []:
        if not isinstance(entry, dict):
            continue
        try:
            batch = ImportBatch.model_validate(entry)
        except Exception:
            continue
        if batch.open_questions:
            has_open_questions = True
            break

    if not pending:
        if has_open_questions:
            return response.model_copy(update={"questions": []})
        return response

    hydrated: list[MenuImportQuizQuestion] = []
    for index, open_question in enumerate(pending):
        agent_question = response.questions[index] if index < len(response.questions) else None
        suggested = (
            list(agent_question.suggested_answers)
            if agent_question and agent_question.suggested_answers
            else _fallback_suggestions(open_question)
        )
        allow_other = agent_question.allow_other if agent_question is not None else True
        hydrated.append(
            MenuImportQuizQuestion(
                id=open_question.id,
                question=_normalize_question_text(open_question.question_es),
                suggested_answers=suggested,
                allow_other=allow_other,
            )
        )

    return response.model_copy(update={"questions": hydrated})
