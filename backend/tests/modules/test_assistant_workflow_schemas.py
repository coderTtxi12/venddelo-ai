from app.modules.assistant.agent.workflow.schemas import (
    ExecutedStep,
    ExecutionRecord,
    WorkflowEvaluation,
    adjust_evaluation_for_execution,
    execution_needs_user_clarification,
)


def test_execution_needs_user_clarification_when_notes_without_tools():
    execution = ExecutionRecord(
        status="failed",
        summary="Se requieren datos para crear el nuevo producto.",
        notes=["Falta el nombre del producto (name)."],
    )
    assert execution_needs_user_clarification(execution) is True


def test_execution_needs_user_clarification_false_after_tool_runs():
    execution = ExecutionRecord(
        status="failed",
        summary="No se encontró el producto.",
        notes=["Intentar otra búsqueda"],
        executed_steps=[
            ExecutedStep(
                step_id="lookup_1",
                tool="search_products",
                status="success",
                output_summary="0 resultados",
            )
        ],
        tools_used=["search_products"],
    )
    assert execution_needs_user_clarification(execution) is False


def test_adjust_evaluation_for_execution_disables_replan_for_missing_inputs():
    execution = ExecutionRecord(
        status="failed",
        summary="Falta información clave.",
        notes=["Falta el precio en centavos (price_cents)."],
    )
    evaluation = WorkflowEvaluation(
        ok=False,
        should_replan=True,
        issues=["No se pudo crear el producto"],
    )
    adjusted = adjust_evaluation_for_execution(evaluation, execution)
    assert adjusted.should_replan is False
    assert adjusted.ok is False
    assert adjusted.user_facing_hint == "Falta el precio en centavos (price_cents)."
