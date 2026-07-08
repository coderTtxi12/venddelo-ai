from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.clarification import (
    apply_clarification_answers,
    get_unanswered_open_questions,
    hydrate_menu_import_response,
    parse_clarification_answers_from_message,
    resolve_clarification_answers,
)
from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizOption,
    MenuImportQuizQuestion,
    MenuImportUserResponse,
)


def _session(**overrides):
    defaults = dict(
        status="clarifying",
        draft_batches=[],
        clarification_answers={},
        source_files=[],
    )
    defaults.update(overrides)
    return MenuImportSession(**defaults)


def test_parse_clarification_answers_from_lines():
    text = (
        "Respuestas de aclaración del menú:\n"
        "- q1: Usar como Descripción\n"
        "- q_papas: Con queso"
    )
    parsed = parse_clarification_answers_from_message(text)
    assert parsed == {"q1": "Usar como Descripción", "q_papas": "Con queso"}


def test_parse_clarification_answers_from_json_fence():
    text = (
        "Respuestas de aclaración del menú:\n"
        "- q1: Ignorar\n\n"
        "```menu_import_clarification\n"
        '{"menu_import_clarification":{"answers":{"q_355_ml":"Ignorar"}}}\n'
        "```"
    )
    parsed = parse_clarification_answers_from_message(text)
    assert parsed is not None
    assert parsed["q1"] == "Ignorar"
    assert parsed["q_355_ml"] == "Ignorar"


def test_resolve_maps_q1_to_real_pending_id():
    batch = {
        "batch_index": 0,
        "categories": [],
        "open_questions": [
            {
                "id": "q_355_ml_description",
                "question_es": "¿Qué hacer con 355 ml?",
            }
        ],
    }
    session = _session(draft_batches=[batch])
    pending = get_unanswered_open_questions(session)
    resolved = resolve_clarification_answers(
        {"q1": "Usar como Descripción"},
        pending,
    )
    assert resolved == {"q_355_ml_description": "Usar como Descripción"}


def test_apply_clarification_marks_question_answered():
    batch = {
        "batch_index": 0,
        "categories": [],
        "open_questions": [
            {"id": "q_355_ml_description", "question_es": "¿Qué hacer con 355 ml?"},
            {"id": "q2", "question_es": "¿Otra?"},
        ],
    }
    session = _session(draft_batches=[batch])
    unanswered = apply_clarification_answers(
        session,
        {"q_355_ml_description": "Usar como descripción"},
    )
    assert unanswered == ["q2"]
    assert session.clarification_answers["q_355_ml_description"] == "Usar como descripción"


def test_hydrate_replaces_agent_question_ids_with_session_ids():
    batch = {
        "batch_index": 0,
        "categories": [],
        "open_questions": [
            {
                "id": "q_355_ml_description",
                "question_es": "¿El texto 355 ml va en description?",
            }
        ],
    }
    session = _session(draft_batches=[batch])
    agent_response = MenuImportUserResponse(
        message="Necesito una aclaración.",
        questions=[
            MenuImportQuizQuestion(
                id="q1",
                question="¿Pregunta inventada?",
                suggested_answers=[
                    MenuImportQuizOption(id="opt_1", label="Descripción"),
                    MenuImportQuizOption(id="opt_2", label="Ignorar"),
                ],
            )
        ],
    )

    hydrated = hydrate_menu_import_response(agent_response, session)

    assert len(hydrated.questions) == 1
    assert hydrated.questions[0].id == "q_355_ml_description"
    assert "355 ml" in hydrated.questions[0].question
    assert hydrated.questions[0].suggested_answers[0].label == "Descripción"
