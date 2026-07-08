"""SSE payloads for explicit workflow phases."""

from __future__ import annotations

from app.core.llm.ports import ChatStreamEvent
from app.modules.assistant.agent.workflow.schemas import WorkflowEvaluation, WorkflowPlan

PHASE_LABELS: dict[str, str] = {
    "context": "Preparando contexto",
    "planning": "Planificando",
    "menu_import": "Importando menú",
    "executing": "Ejecutando plan",
    "evaluating": "Evaluando resultados",
    "replanning": "Ajustando plan",
    "responding": "Redactando respuesta",
}


def phase_event(phase: str) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.phase",
        data={
            "phase": phase,
            "label": PHASE_LABELS.get(phase, phase),
        },
    )


def plan_event(plan: WorkflowPlan, *, replan: bool = False) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.plan_update" if replan else "agent.plan",
        data={
            "goal": plan.goal,
            "summary": plan.goal,
            "requires_tools": plan.requires_tools,
            "risk_level": plan.risk_level,
            "missing_information": plan.missing_information,
            "success_criteria": plan.success_criteria,
            "stop_conditions": plan.stop_conditions,
            "steps": [
                {
                    **step.model_dump(),
                    "id": step.step_id,
                    "goal": step.action,
                    "tool_hint": step.tool,
                }
                for step in plan.steps
            ],
            "replan": replan,
        },
    )


def step_events(plan: WorkflowPlan, *, active_index: int | None = None, done_through: int = -1):
    """Yield per-step status events for the plan checklist UI."""
    for index, step in enumerate(plan.steps):
        if index <= done_through:
            status = "done"
        elif active_index is not None and index == active_index:
            status = "active"
        else:
            status = "pending"
        yield ChatStreamEvent(
            event="agent.step",
            data={
                "step_id": step.step_id,
                "id": step.step_id,
                "index": index,
                "action": step.action,
                "goal": step.action,
                "tool": step.tool,
                "tool_hint": step.tool,
                "status": status,
            },
        )


def evaluation_event(evaluation: WorkflowEvaluation) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.evaluation",
        data={
            "ok": evaluation.ok,
            "should_replan": evaluation.should_replan,
            "issues": evaluation.issues,
        },
    )
