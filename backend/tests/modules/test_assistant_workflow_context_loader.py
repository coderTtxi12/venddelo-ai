from app.modules.assistant.agent.workflow.context_loader import (
    _format_evaluation_result,
    _format_execution_findings,
    menu_import_input,
    resolve_runtime_skill_ids,
    responder_input,
    router_input,
)
from app.modules.assistant.agent.workflow.schemas import (
    ExecutedStep,
    ExecutionRecord,
    WorkflowEvaluation,
    WorkflowRouteDecision,
    clear_execution_approval_gates,
)


def test_resolve_runtime_skill_ids_intersects_discovered_skills():
    effective = resolve_runtime_skill_ids(
        ["menu_read", "menu_write", "unknown_skill"],
        rollout_skill_ids=None,
    )
    assert "menu_read" in effective
    assert "menu_write" in effective
    assert "unknown_skill" not in effective


def test_resolve_runtime_skill_ids_honors_rollout_cap():
    effective = resolve_runtime_skill_ids(
        ["menu_read", "menu_write"],
        rollout_skill_ids=("menu_read",),
    )
    assert effective == ["menu_read"]


def test_clear_execution_approval_gates():
    execution = ExecutionRecord(
        requires_user_approval=True,
        approval_reason="Esperando confirmación",
    )
    cleared_execution = clear_execution_approval_gates(execution)
    assert cleared_execution.requires_user_approval is False
    assert cleared_execution.approval_reason is None


def test_format_execution_findings_includes_full_executor_payload():
    execution = ExecutionRecord(
        status="success",
        summary="Se listaron categorías y productos.",
        executed_steps=[
            ExecutedStep(
                step_id="lookup_1",
                tool="list_categories",
                output_summary="Listed 3 categories",
            ),
            ExecutedStep(
                step_id="lookup_2",
                tool="list_products",
                output_summary="Listed 15 products (catalog: 15 total)",
            ),
        ],
        requires_user_approval=False,
        notes=["Sin aprobación pendiente"],
        tools_used=["list_categories", "list_products"],
    )

    findings = _format_execution_findings(execution)

    assert "### Datos para responder" in findings
    assert "Se listaron categorías y productos." in findings
    assert "### Metadatos de ejecución" in findings
    assert '"step_id": "lookup_1"' in findings
    assert '"output_summary": "Listed 3 categories"' in findings
    assert "requires_user_approval" not in findings
    assert "tools_used" not in findings


def test_format_evaluation_result_includes_full_payload():
    evaluation = WorkflowEvaluation(
        ok=False,
        issues=["Faltan precios de dos productos"],
        should_replan=False,
        user_facing_hint="Pide al dueño los nombres exactos de los productos.",
    )

    rendered = _format_evaluation_result(evaluation)

    assert rendered.startswith("```json\n")
    assert '"ok": false' in rendered
    assert '"issues": [' in rendered
    assert '"should_replan": false' in rendered
    assert '"user_facing_hint": "Pide al dueño los nombres exactos de los productos."' in rendered


def test_responder_input_puts_formatted_findings_for_tool_runs():
    context = type(
        "Ctx",
        (),
        {
            "conversation_history": "(sin historial previo en esta conversación)",
            "user_message": "¿Qué categorías tengo?",
        },
    )()
    route = WorkflowRouteDecision(
        route="executor",
        goal="Listar categorías",
        reason="Necesita datos del menú.",
    )
    execution = ExecutionRecord(
        summary="Hay 3 categorías.",
        executed_steps=[
            ExecutedStep(
                step_id="lookup_1",
                tool="list_categories",
                output_summary="Listed 3 categories",
            )
        ],
    )
    evaluation = WorkflowEvaluation(ok=True, issues=[])

    payload = responder_input(context, route, execution, evaluation)

    assert "## Findings" in payload
    assert "## Evaluation" in payload
    assert "### Datos para responder" in payload
    assert "Hay 3 categorías." in payload
    assert "### Metadatos de ejecución" in payload
    assert '"ok": true' in payload


def test_router_input_includes_menu_import_signals():
    context = type(
        "Ctx",
        (),
        {
            "conversation_history": "(sin historial previo en esta conversación)",
            "user_message": "Importa mi menú\n\n## Chat attachments\n\n- **menu.pdf**",
            "menu_import_enabled": True,
            "menu_source_attachment_count": 1,
            "import_session_context": "Hay una **sesión de importación de menú ACTIVA** (fase: clarifying).",
        },
    )()

    payload = router_input(context)

    assert "## Menu import capability" in payload
    assert "archivo(s) de menú" in payload
    assert "menu_import" in payload
    assert "no al executor" in payload
    assert "## Active menu import session" in payload


def test_router_instructions_prioritize_menu_import_with_attachments():
    from app.modules.assistant.agent.workflow.prompts import ROUTER_INSTRUCTIONS

    assert "menu_import" in ROUTER_INSTRUCTIONS
    assert "menu_source" in ROUTER_INSTRUCTIONS
    assert "executor" in ROUTER_INSTRUCTIONS


def test_menu_import_input_uses_menu_import_conversation_history():
    context = type(
        "Ctx",
        (),
        {
            "conversation_history": "(sin historial previo en esta conversación)",
            "menu_import_conversation_history": (
                "Usuario: agrega esos productos\n\nAsistente: Vista previa lista."
            ),
            "user_message": "continua",
            "import_session_context": "Hay una **sesión de importación de menú ACTIVA** (fase: preview_batch).",
            "menu_source_attachment_count": 0,
        },
    )()
    route = WorkflowRouteDecision(
        route="menu_import",
        goal="Continuar importación",
        reason="Sesión activa en preview.",
    )

    payload = menu_import_input(context, route)

    assert "Vista previa lista." in payload
    assert "(sin historial previo en esta conversación)" not in payload
    assert "## Import session" in payload
