import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from openai.types.responses.response_text_delta_event import ResponseTextDeltaEvent

from agents.stream_events import RawResponsesStreamEvent

from app.core.config import Settings
from app.modules.assistant.agent.service import AssistantAgentService, build_skill_registry
from app.modules.assistant.agent.workflow.context_loader import WorkflowContext, WorkflowRuntimeBundle
from app.modules.assistant.agent.workflow.orchestrator import WorkflowOrchestrator
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    PlanStep,
    WorkflowEvaluation,
    WorkflowPlan,
)


def _sample_plan() -> WorkflowPlan:
    return WorkflowPlan(
        goal="Listar categorías del menú",
        success_criteria=["Se obtiene la lista de categorías activas"],
        steps=[
            PlanStep(
                step_id="step_1",
                tool="list_categories",
                action="Listar categorías del menú",
                reason="El usuario quiere ver sus categorías",
            )
        ],
    )


def _workflow_context(conversation_id: uuid.UUID | None = None) -> WorkflowContext:
    resolved_id = conversation_id or uuid.uuid4()
    return WorkflowContext(
        user_message="¿Qué categorías tengo?",
        restaurant_id=uuid.uuid4(),
        conversation_id=resolved_id,
        effective_skill_ids=["menu_read"],
        skill_catalog="- **menu_read**: read menu",
        system_prompt="You are the assistant.",
        conversation_history="(sin historial previo en esta conversación)",
        assistant_display_name="Luna",
    )


def _runtime_bundle(conversation_id: uuid.UUID | None = None) -> WorkflowRuntimeBundle:
    context = _workflow_context(conversation_id)
    registry = build_skill_registry(["menu_read"])
    return WorkflowRuntimeBundle(
        context=context,
        registry=registry,
        conversation_id=context.conversation_id,
    )


def _run_result(final_output):
    return type("RunResult", (), {"final_output": final_output, "new_items": []})()


def _structured_result(model):
    result = _run_result(model)
    result.final_output_as = lambda cls, raise_if_incorrect_type=False: model  # noqa: ARG005
    return result


def test_workflow_orchestrator_runs_phases_in_order():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    plan = _sample_plan()
    execution = ExecutionRecord(summary="Hay 2 categorías: Tacos y Bebidas.", tools_used=["list_categories"])
    evaluation = WorkflowEvaluation(ok=True, issues=[])

    class FakeStreamedResult:
        async def stream_events(self):
            yield RawResponsesStreamEvent(
                data=ResponseTextDeltaEvent(
                    content_index=0,
                    delta="Tienes 2 categorías.",
                    item_id="item-1",
                    logprobs=[],
                    output_index=0,
                    sequence_number=1,
                    type="response.output_text.delta",
                )
            )

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Planner":
            return _structured_result(plan)
        if name == "Executor":
            return _structured_result(execution)
        if name == "Evaluator":
            return _structured_result(evaluation)
        if name == "Replanner":
            return _structured_result(plan)
        raise AssertionError(f"Unexpected agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.persist_turn",
        ) as persist_mock,
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            return_value=FakeStreamedResult(),
        ),
    ):
        events = asyncio.run(_collect(orchestrator))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases == ["context", "planning", "executing", "evaluating", "responding"]
    assert any(event.event == "agent.plan" for event in events)
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == "Tienes 2 categorías."
    persist_mock.assert_called_once()


def test_workflow_orchestrator_replans_when_evaluation_fails():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    initial_plan = _sample_plan()
    revised_plan = WorkflowPlan(
        goal="Buscar productos por nombre",
        success_criteria=["Se encuentra el producto solicitado"],
        steps=[
            PlanStep(
                step_id="step_1",
                tool="search_products",
                action="Buscar producto",
                reason="El producto no se encontró en el primer intento",
            )
        ],
    )
    execution = ExecutionRecord(summary="No se encontró el producto.", tools_used=["search_products"])
    failed_eval = WorkflowEvaluation(ok=False, should_replan=True, issues=["Producto no encontrado"])
    passed_eval = WorkflowEvaluation(ok=True, issues=[])

    class FakeStreamedResult:
        async def stream_events(self):
            yield RawResponsesStreamEvent(
                data=ResponseTextDeltaEvent(
                    content_index=0,
                    delta="No encontré ese producto.",
                    item_id="item-1",
                    logprobs=[],
                    output_index=0,
                    sequence_number=1,
                    type="response.output_text.delta",
                )
            )

    evaluator_calls = {"count": 0}

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Planner":
            return _structured_result(initial_plan)
        if name == "Executor":
            return _structured_result(execution)
        if name == "Evaluator":
            evaluator_calls["count"] += 1
            if evaluator_calls["count"] == 1:
                return _structured_result(failed_eval)
            return _structured_result(passed_eval)
        if name == "Replanner":
            return _structured_result(revised_plan)
        raise AssertionError(f"Unexpected agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.persist_turn"),
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            return_value=FakeStreamedResult(),
        ),
    ):
        events = asyncio.run(_collect(orchestrator))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert "replanning" in phases
    assert any(event.event == "agent.plan_update" for event in events)


def test_workflow_orchestrator_direct_mode_skips_execution():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    direct_plan = WorkflowPlan(goal="Saludo del usuario", requires_tools=False, steps=[])

    class FakeStreamedResult:
        async def stream_events(self):
            yield RawResponsesStreamEvent(
                data=ResponseTextDeltaEvent(
                    content_index=0,
                    delta="¡Hola! ¿En qué te ayudo con tu menú?",
                    item_id="item-1",
                    logprobs=[],
                    output_index=0,
                    sequence_number=1,
                    type="response.output_text.delta",
                )
            )

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Planner":
            return _structured_result(direct_plan)
        raise AssertionError(f"Unexpected agent run in direct mode: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.persist_turn") as persist_mock,
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            return_value=FakeStreamedResult(),
        ),
    ):
        events = asyncio.run(_collect(orchestrator, message="Hola"))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases == ["context", "planning", "responding"]
    assert not any(event.event == "agent.plan" for event in events)
    assert not any(event.event == "agent.step" for event in events)
    assert not any(event.event == "agent.evaluation" for event in events)
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == "¡Hola! ¿En qué te ayudo con tu menú?"
    persist_mock.assert_called_once()


async def _collect(orchestrator: WorkflowOrchestrator, message: str = "¿Qué categorías tengo?"):
    events = []
    async for event in orchestrator.stream_chat(
        uow=MagicMock(),
        restaurant_id=uuid.uuid4(),
        message=message,
    ):
        events.append(event)
    return events
