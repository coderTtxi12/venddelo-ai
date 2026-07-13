"""Parse owner clarification quiz submissions from chat messages."""

from __future__ import annotations

import re

from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion

QUIZ_SUBMISSION_PREFIX = "Respuestas de aclaración del menú:"
_ANSWER_LINE = re.compile(r"^\d+\.\s*(.+?)\s*→\s*(.+?)\s*$")


def _normalize_question_text(text: str) -> str:
    return text.strip().rstrip("?").casefold()


def parse_quiz_answers_from_message(
    message: str,
    open_questions: list[OpenQuestion],
) -> dict[str, str]:
    """Map open-question ids to owner answers from the frontend quiz submission."""
    if QUIZ_SUBMISSION_PREFIX not in message:
        return {}

    answers: dict[str, str] = {}
    for raw_line in message.splitlines():
        line = raw_line.strip()
        match = _ANSWER_LINE.match(line)
        if not match:
            continue
        question_text, answer = match.group(1).strip(), match.group(2).strip()
        if not answer:
            continue
        normalized = _normalize_question_text(question_text)
        for question in open_questions:
            if question.id in answers:
                continue
            candidates = {
                _normalize_question_text(question.question_es),
                _normalize_question_text(f"{question.question_es}?"),
            }
            if normalized in candidates or any(
                normalized in candidate or candidate in normalized for candidate in candidates
            ):
                answers[question.id] = answer
                break
    return answers


def split_owner_turn_message(
    message: str,
    open_questions: list[OpenQuestion],
) -> tuple[dict[str, str], str]:
    """Return quiz answers and any free-text instructions outside the quiz block."""
    stripped = message.strip()
    if QUIZ_SUBMISSION_PREFIX not in stripped:
        return {}, stripped

    answers = parse_quiz_answers_from_message(stripped, open_questions)
    lines = stripped.splitlines()
    extra_lines: list[str] = []
    for line in lines:
        text = line.strip()
        if not text or text == QUIZ_SUBMISSION_PREFIX:
            continue
        if _ANSWER_LINE.match(text):
            continue
        extra_lines.append(text)
    instructions = "\n".join(extra_lines).strip()
    return answers, instructions


def format_question_answers_for_prompt(
    *,
    clarification_answers: dict[str, str] | None,
    open_questions: list[OpenQuestion],
) -> str:
    answers = clarification_answers or {}
    if not answers and not open_questions:
        return "(ninguna — el propietario aún no ha respondido preguntas de aclaración)"

    lines: list[str] = []
    indexed = {question.id: question for question in open_questions}
    for question_id, answer in answers.items():
        label = answer.strip()
        if not label:
            continue
        question = indexed.get(question_id)
        prompt_question = question.question_es if question else question_id
        lines.append(f"- [{question_id}] {prompt_question}: {label}")

    if not lines:
        return "(ninguna — el propietario aún no ha respondido preguntas de aclaración)"
    return "\n".join(lines)
