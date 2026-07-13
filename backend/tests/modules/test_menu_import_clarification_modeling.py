from __future__ import annotations

import json

from app.modules.assistant.skills.menu_import.clarification_input import (
    format_question_answers_for_prompt,
    parse_quiz_answers_from_message,
    split_owner_turn_message,
)
from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion
from app.modules.assistant.skills.menu_import.extraction_prompt import build_modeling_prompt


def test_build_modeling_prompt_injects_menu_json_and_owner_inputs():
    menu = {"categories": [{"ref": "cat_1", "name": "Tacos", "products": []}]}
    prompt = build_modeling_prompt(
        {
            "menu_json": menu,
            "clarification_answers": {"q_1": "Sí"},
            "open_questions": [
                {
                    "id": "q_1",
                    "question_es": "¿Incluye bebida?",
                    "suggested_answers": ["Sí", "No"],
                }
            ],
            "owner_instructions": "Unifica tamaños en un solo producto",
        }
    )
    assert "CURRENT MENU JSON:" in prompt
    assert '"cat_1"' in prompt
    assert "OWNER QUESTION ANSWERS:" in prompt
    assert "[q_1]" in prompt
    assert "ADDITIONAL OWNER INSTRUCTIONS:" in prompt
    assert "Unifica tamaños en un solo producto" in prompt
    assert "`ocr_original` is the sole menu source" in prompt


def test_parse_quiz_answers_from_frontend_submission():
    message = """Respuestas de aclaración del menú:
1. ¿El combo incluye bebida? → Sí
2. ¿Las alitas son por pieza? → Por orden
"""
    questions = [
        OpenQuestion(id="q_combo", question_es="¿El combo incluye bebida?"),
        OpenQuestion(id="q_wings", question_es="¿Las alitas son por pieza?"),
    ]
    answers = parse_quiz_answers_from_message(message, questions)
    assert answers == {"q_combo": "Sí", "q_wings": "Por orden"}


def test_split_owner_turn_keeps_extra_instructions():
    message = """Respuestas de aclaración del menú:
1. ¿El combo incluye bebida? → Sí

Consolida los tamaños de alitas en un solo producto."""
    questions = [OpenQuestion(id="q_combo", question_es="¿El combo incluye bebida?")]
    answers, instructions = split_owner_turn_message(message, questions)
    assert answers == {"q_combo": "Sí"}
    assert "Consolida los tamaños" in instructions


def test_format_question_answers_for_prompt_empty():
    text = format_question_answers_for_prompt(
        clarification_answers={},
        open_questions=[],
    )
    assert "ninguna" in text
