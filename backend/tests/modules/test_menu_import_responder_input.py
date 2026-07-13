import uuid

from app.modules.assistant.agent.workflow.context_loader import (
    WorkflowContext,
    menu_import_responder_input,
)
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord, WorkflowRouteDecision
from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizOption,
    MenuImportQuizQuestion,
)


def test_menu_import_responder_input_includes_pending_quiz_block():
    context = WorkflowContext(
        user_message="importa mi menú",
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        effective_skill_ids=["menu_import"],
        skill_catalog="",
        system_prompt="",
        conversation_history="",
        assistant_display_name="Asistente",
    )
    route = WorkflowRouteDecision(route="menu_import", goal="Importar menú")
    execution = ExecutionRecord(summary="OCR listo", status="success")
    pending = [
        MenuImportQuizQuestion(
            id="q_combo",
            question="¿El combo incluye bebida?",
            suggested_answers=[
                MenuImportQuizOption(id="opt_1", label="Sí"),
                MenuImportQuizOption(id="opt_2", label="No"),
            ],
        )
    ]

    text = menu_import_responder_input(context, route, execution, pending_quiz=pending)

    assert "## Pending clarification questions" in text
    assert '"id": "q_combo"' in text
    assert "copia **exactamente** este arreglo en el campo `questions`" in text.lower() or "Copia **exactamente**" in text
