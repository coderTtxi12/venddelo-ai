import asyncio
import uuid
from unittest.mock import MagicMock, patch

from openai.types.responses.response_text_delta_event import ResponseTextDeltaEvent

from agents.stream_events import RawResponsesStreamEvent

from app.core.config import Settings
from app.modules.assistant.agent.service import build_skill_registry
from app.modules.assistant.agent.workflow.context_loader import WorkflowContext, WorkflowRuntimeBundle
from app.modules.assistant.agent.workflow.orchestrator import WorkflowOrchestrator
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    WorkflowEvaluation,
    WorkflowRouteDecision,
)
from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizOption,
    MenuImportQuizQuestion,
    MenuImportUserResponse,
)


def _executor_route() -> WorkflowRouteDecision:
    return WorkflowRouteDecision(
        route="executor",
        goal="Listar categorías del menú",
        reason="El usuario pregunta por categorías del menú live.",
    )


def _responder_route() -> WorkflowRouteDecision:
    return WorkflowRouteDecision(
        route="responder",
        goal="Saludo del usuario",
        reason="Es un saludo sin necesidad de tools.",
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
    menu_import_registry = build_skill_registry(["menu_import"])
    return WorkflowRuntimeBundle(
        context=context,
        registry=registry,
        menu_import_registry=menu_import_registry,
        conversation_id=context.conversation_id,
    )


def _run_result(final_output):
    return type("RunResult", (), {"final_output": final_output, "new_items": []})()


def _structured_result(model):
    result = _run_result(model)
    result.final_output_as = lambda cls, raise_if_incorrect_type=False: model  # noqa: ARG005
    return result


class FakeStreamedResult:
    def __init__(
        self,
        *,
        text_delta: str | None = None,
        final_output: object | None = None,
    ) -> None:
        self._text_delta = text_delta
        self._final_output = final_output

    async def stream_events(self):
        if self._text_delta:
            yield RawResponsesStreamEvent(
                data=ResponseTextDeltaEvent(
                    content_index=0,
                    delta=self._text_delta,
                    item_id="item-1",
                    logprobs=[],
                    output_index=0,
                    sequence_number=1,
                    type="response.output_text.delta",
                )
            )

    def final_output_as(self, cls, raise_if_incorrect_type=False):  # noqa: ARG002
        if self._final_output is not None:
            return self._final_output
        raise AssertionError("No final output configured for streamed run")


def test_workflow_orchestrator_runs_phases_in_order():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    route = _executor_route()
    execution = ExecutionRecord(summary="Hay 2 categorías: Tacos y Bebidas.", tools_used=["list_categories"])
    evaluation = WorkflowEvaluation(ok=True, issues=[])

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Evaluator":
            return _structured_result(evaluation)
        raise AssertionError(f"Unexpected agent run: {name!r}")

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Router":
            return FakeStreamedResult(final_output=route)
        if name == "Executor":
            return FakeStreamedResult(final_output=execution)
        if name == "Responder":
            return FakeStreamedResult(text_delta="Tienes 2 categorías.")
        raise AssertionError(f"Unexpected streamed agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn",
        ) as persist_mock,
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases == ["context", "routing", "executing", "evaluating", "responding"]
    assert not any(event.event == "agent.plan" for event in events)
    thought_events = [event for event in events if event.event == "agent.thought"]
    assert len(thought_events) == 1
    assert thought_events[0].data["source"] == "router"
    assert "menú live" in thought_events[0].data["text"]
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == "Tienes 2 categorías."
    persist_mock.assert_called_once()


def test_workflow_orchestrator_retries_executor_when_evaluation_fails():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    route = _executor_route()
    failed_execution = ExecutionRecord(summary="No se encontró el producto.", tools_used=["search_products"])
    passed_execution = ExecutionRecord(summary="Encontré el producto Clásica.", tools_used=["search_products"])
    failed_eval = WorkflowEvaluation(ok=False, should_replan=True, issues=["Producto no encontrado"])
    passed_eval = WorkflowEvaluation(ok=True, issues=[])

    executor_calls = {"count": 0}
    evaluator_calls = {"count": 0}

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Evaluator":
            evaluator_calls["count"] += 1
            if evaluator_calls["count"] == 1:
                return _structured_result(failed_eval)
            return _structured_result(passed_eval)
        raise AssertionError(f"Unexpected agent run: {name!r}")

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Router":
            return FakeStreamedResult(final_output=route)
        if name == "Executor":
            executor_calls["count"] += 1
            if executor_calls["count"] == 1:
                return FakeStreamedResult(final_output=failed_execution)
            return FakeStreamedResult(final_output=passed_execution)
        if name == "Responder":
            return FakeStreamedResult(text_delta="Encontré Clásica.")
        raise AssertionError(f"Unexpected streamed agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn"),
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases.count("executing") == 2
    assert phases.count("evaluating") == 2
    assert executor_calls["count"] == 2


def test_workflow_orchestrator_direct_route_skips_executor():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    route = _responder_route()

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        raise AssertionError(f"Unexpected agent run in direct route: {name!r}")

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Router":
            return FakeStreamedResult(final_output=route)
        if name == "Responder":
            return FakeStreamedResult(text_delta="¡Hola! ¿En qué te ayudo con tu menú?")
        raise AssertionError(f"Unexpected streamed agent run in direct route: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn") as persist_mock,
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator, message="Hola"))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases == ["context", "routing", "responding"]
    assert not any(event.event == "agent.evaluation" for event in events)
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == "¡Hola! ¿En qué te ayudo con tu menú?"
    persist_mock.assert_called_once()


def test_workflow_orchestrator_menu_import_handoff_skips_executor():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read", "menu_import"))
    context = _workflow_context()
    context = WorkflowContext(
        user_message=context.user_message,
        restaurant_id=context.restaurant_id,
        conversation_id=context.conversation_id,
        effective_skill_ids=context.effective_skill_ids,
        skill_catalog=context.skill_catalog,
        system_prompt=context.system_prompt,
        conversation_history=context.conversation_history,
        assistant_display_name=context.assistant_display_name,
        menu_import_enabled=True,
        menu_source_attachment_count=1,
    )
    runtime = WorkflowRuntimeBundle(
        context=context,
        registry=build_skill_registry(["menu_read"]),
        menu_import_registry=build_skill_registry(["menu_import"]),
        conversation_id=context.conversation_id,
    )

    route = WorkflowRouteDecision(
        route="menu_import",
        goal="Importar menú completo desde PDF",
        reason="El usuario subió un menú y quiere publicarlo completo.",
    )

    async def fake_run(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        raise AssertionError("Evaluator/Responder should not run for menu_import handoff")

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Router":
            return FakeStreamedResult(final_output=route)
        if name == "MenuImport":
            return FakeStreamedResult(
                final_output=MenuImportUserResponse(
                    message="Empezaré a importar tu menú.",
                    questions=[],
                ),
            )
        raise AssertionError(f"Unexpected streamed agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn",
        ) as persist_mock,
        patch("app.modules.assistant.agent.workflow.orchestrator.Runner.run", side_effect=fake_run),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator, message="Importa este menú"))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases == ["context", "routing", "executing"]
    phase_labels = [
        event.data.get("label")
        for event in events
        if event.event == "agent.phase" and event.data.get("phase") == "executing"
    ]
    assert phase_labels == ["Importando menú"]
    assert not any(event.event == "agent.evaluation" for event in events)
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == "Empezaré a importar tu menú."
    persist_mock.assert_called_once()


def test_workflow_orchestrator_menu_import_emits_quiz_event():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read", "menu_import"))
    context = _workflow_context()
    context = WorkflowContext(
        user_message=context.user_message,
        restaurant_id=context.restaurant_id,
        conversation_id=context.conversation_id,
        effective_skill_ids=context.effective_skill_ids,
        skill_catalog=context.skill_catalog,
        system_prompt=context.system_prompt,
        conversation_history=context.conversation_history,
        assistant_display_name=context.assistant_display_name,
        menu_import_enabled=True,
        menu_source_attachment_count=1,
    )
    runtime = WorkflowRuntimeBundle(
        context=context,
        registry=build_skill_registry(["menu_read"]),
        menu_import_registry=build_skill_registry(["menu_import"]),
        conversation_id=context.conversation_id,
    )

    route = WorkflowRouteDecision(
        route="menu_import",
        goal="Importar menú completo",
        reason="Menú adjunto para importación.",
    )
    import_response = MenuImportUserResponse(
        message="Necesito aclarar unos complementos antes de continuar.",
        questions=[
            MenuImportQuizQuestion(
                id="q_complement_tacos",
                question="¿La salsa extra es obligatoria en Tacos al pastor?",
                suggested_answers=[
                    MenuImportQuizOption(id="opt_1", label="Obligatorio"),
                    MenuImportQuizOption(id="opt_2", label="Opcional"),
                ],
            ),
        ],
    )

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Router":
            return FakeStreamedResult(final_output=route)
        if name == "MenuImport":
            return FakeStreamedResult(final_output=import_response)
        raise AssertionError(f"Unexpected streamed agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn",
        ),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator, message="Importa este menú"))

    quiz_events = [event for event in events if event.event == "menu_import.quiz"]
    assert len(quiz_events) == 1
    assert quiz_events[0].data["questions"][0]["id"] == "q_complement_tacos"
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == import_response.message
    assert events[-1].data["menu_import"]["questions"][0]["question"].endswith("?")


async def _collect(orchestrator: WorkflowOrchestrator, message: str = "¿Qué categorías tengo?"):
    events = []
    async for event in orchestrator.stream_chat(
        uow=MagicMock(),
        restaurant_id=uuid.uuid4(),
        message=message,
    ):
        events.append(event)
    return events
