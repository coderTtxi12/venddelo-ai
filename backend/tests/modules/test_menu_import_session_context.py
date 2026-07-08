import uuid

from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.agent.workflow.context_loader import (
    WorkflowContext,
    executor_input,
    planner_input,
)
from app.modules.assistant.agent.workflow.schemas import WorkflowPlan
from app.modules.assistant.skills.menu_import.session_context import (
    build_import_session_context,
)


def _workflow_context(import_session_status=None):
    return WorkflowContext(
        user_message="para papas no pongas extras",
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        effective_skill_ids=["menu_import"],
        skill_catalog="- **menu_import**: import",
        system_prompt="You are the assistant.",
        conversation_history="(sin historial previo en esta conversación)",
        assistant_display_name="Luna",
        import_session_status=import_session_status,
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


def test_returns_none_when_no_session():
    assert build_import_session_context(None) is None


def test_returns_none_for_terminal_session():
    assert build_import_session_context(_session(status="completed")) is None
    assert build_import_session_context(_session(status="cancelled")) is None


def test_summarizes_active_session_with_pending_questions():
    batch = {
        "batch_index": 0,
        "categories": [
            {
                "ref": "cat_1",
                "name": "Hamburguesas",
                "products": [
                    {"ref": "prod_1", "name": "La Javis", "price_mxn": 120},
                    {"ref": "prod_2", "name": "La Clásica", "price_mxn": 100},
                ],
            }
        ],
        "open_questions": [
            {"id": "q_papas", "question_es": "¿Qué extras para papas?"},
            {"id": "q_carne", "question_es": "¿Extras de carne?"},
        ],
    }
    session = _session(
        draft_batches=[batch],
        source_files=[{"path": "a.pdf", "mime_type": "application/pdf"}],
    )

    summary = build_import_session_context(session)

    assert summary is not None
    assert "ACTIVA" in summary
    assert "clarifying" in summary
    assert "Productos extraídos por OCR: 2" in summary
    assert "Archivos fuente registrados: 1" in summary
    assert "Preguntas de aclaración pendientes: 2" in summary
    assert "[q_papas] ¿Qué extras para papas?" in summary
    assert "[q_carne] ¿Extras de carne?" in summary


def test_excludes_already_answered_questions():
    batch = {
        "batch_index": 0,
        "categories": [],
        "open_questions": [
            {"id": "q1", "question_es": "Pregunta 1"},
            {"id": "q2", "question_es": "Pregunta 2"},
        ],
    }
    session = _session(
        draft_batches=[batch],
        clarification_answers={"q1": "ya respondida"},
    )

    summary = build_import_session_context(session)

    assert summary is not None
    assert "Preguntas de aclaración pendientes: 1" in summary
    assert "[q2] Pregunta 2" in summary
    assert "q1" not in summary


def test_planner_input_includes_active_session_block():
    context = _workflow_context(import_session_status="Hay una sesión ACTIVA (fase: clarifying).")
    rendered = planner_input(context)

    assert "## Active menu import session" in rendered
    assert "Hay una sesión ACTIVA" in rendered
    assert rendered.index("Active menu import session") < rendered.index("Conversation history")


def test_planner_input_omits_block_when_no_session():
    context = _workflow_context(import_session_status=None)
    rendered = planner_input(context)

    assert "Active menu import session" not in rendered


def test_executor_input_includes_active_session_block():
    context = _workflow_context(import_session_status="Sesión ACTIVA")
    plan = WorkflowPlan(goal="continuar import", requires_tools=True, steps=[])
    rendered = executor_input(context, plan)

    assert "## Active menu import session" in rendered
    assert "Sesión ACTIVA" in rendered
