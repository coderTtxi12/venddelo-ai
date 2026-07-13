"""Convert OCR open_questions into frontend quiz payloads."""

from __future__ import annotations

import re

from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion
from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizOption,
    MenuImportQuizQuestion,
)

_OTHER_LABEL_PATTERN = re.compile(r"^(otro|otra|other|personalizado|custom)$", re.IGNORECASE)


def _visible_suggestions(labels: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in labels:
        label = raw.strip()
        if not label or _OTHER_LABEL_PATTERN.match(label):
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(label)
    return result


def open_question_to_quiz(question: OpenQuestion) -> MenuImportQuizQuestion:
    suggestions = _visible_suggestions(question.suggested_answers)
    if not suggestions:
        suggestions = ["Sí", "No"]
    options = [
        MenuImportQuizOption(id=f"opt_{index + 1}", label=label)
        for index, label in enumerate(suggestions)
    ]
    return MenuImportQuizQuestion(
        id=question.id,
        question=question.question_es,
        suggested_answers=options,
        allow_other=True,
    )


def open_questions_to_quiz(questions: list[OpenQuestion]) -> list[MenuImportQuizQuestion]:
    return [open_question_to_quiz(question) for question in questions]


MENU_IMPORT_QUIZ_HISTORY_HEADER = "## Cuestionario de aclaración del menú"


def format_menu_import_quiz_for_history(
    questions: list[MenuImportQuizQuestion],
) -> str:
    if not questions:
        return ""
    lines = [MENU_IMPORT_QUIZ_HISTORY_HEADER, ""]
    for index, question in enumerate(questions, start=1):
        lines.append(f"{index}. [{question.id}] {question.question}")
        options = ", ".join(option.label for option in question.suggested_answers)
        if options:
            lines.append(f"   Opciones: {options}")
    return "\n".join(lines).strip()


def format_menu_import_assistant_turn_for_history(
    message: str,
    questions: list[MenuImportQuizQuestion] | None = None,
) -> str:
    """Persist assistant prose first, then the quiz block for conversation history."""
    cleaned = message.strip()
    quiz_block = format_menu_import_quiz_for_history(questions or [])
    if cleaned and quiz_block:
        return f"{cleaned}\n\n{quiz_block}"
    if quiz_block:
        return quiz_block
    return cleaned
