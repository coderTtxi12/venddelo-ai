import asyncio
import json
import uuid
from dataclasses import replace
from unittest.mock import MagicMock, patch

from openai.types.responses.response_text_delta_event import ResponseTextDeltaEvent

from agents.stream_events import RawResponsesStreamEvent

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.modules.assistant.agent.service import build_skill_registry
from app.modules.assistant.agent.workflow.context_loader import WorkflowContext, WorkflowRuntimeBundle
from app.modules.assistant.agent.workflow.delegate import (
    DELEGATE_TASK_NAME,
    DelegationState,
    build_delegate_task_tool,
)
from app.modules.assistant.agent.workflow.orchestrator import WorkflowOrchestrator
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord, MAX_DELEGATIONS_PER_TURN
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.skills.context import AgentContext


def _workflow_context(
    conversation_id: uuid.UUID | None = None,
    *,
    menu_import_enabled: bool = False,
) -> WorkflowContext:
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
        menu_import_enabled=menu_import_enabled,
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


async def _collect(orchestrator: WorkflowOrchestrator, message: str = "¿Qué categorías tengo?"):
    events = []
    async for event in orchestrator.stream_chat(
        uow=MagicMock(),
        restaurant_id=uuid.uuid4(),
        message=message,
    ):
        events.append(event)
    return events


def test_workflow_orchestrator_reply_only():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "Orchestrator":
            return FakeStreamedResult(text_delta="¡Hola! ¿En qué te ayudo con tu menú?")
        raise AssertionError(f"Unexpected streamed agent run: {name!r}")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn",
        ) as persist_mock,
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator, message="Hola"))

    phases = [event.data["phase"] for event in events if event.event == "agent.phase"]
    assert phases == ["context", "orchestrating"]
    assert not any(event.event == "agent.evaluation" for event in events)
    assert events[-1].event == "message.complete"
    assert events[-1].data["content"] == "¡Hola! ¿En qué te ayudo con tu menú?"
    persist_mock.assert_called_once()


def test_workflow_orchestrator_wires_clarify_tool_into_orchestrator():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()
    captured: dict[str, object] = {}

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        captured["orchestrator_tools"] = {tool.name for tool in agent.tools}
        return FakeStreamedResult(text_delta="Hola")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn"),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        asyncio.run(_collect(orchestrator, message="Hola"))

    assert captured["orchestrator_tools"] == {DELEGATE_TASK_NAME, "clarify"}


def test_workflow_orchestrator_wires_ocr_tool_when_menu_write_enabled():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(
        settings=settings,
        rollout_skill_ids=("menu_write", "menu_read"),
    )
    runtime = _runtime_bundle()
    runtime = WorkflowRuntimeBundle(
        context=replace(runtime.context, effective_skill_ids=["menu_write", "menu_read"]),
        registry=build_skill_registry(["menu_write", "menu_read"]),
        menu_import_registry=runtime.menu_import_registry,
        conversation_id=runtime.conversation_id,
    )
    captured: dict[str, object] = {}

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        captured["orchestrator_tools"] = {tool.name for tool in agent.tools}
        return FakeStreamedResult(text_delta="Hola")

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn"),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        asyncio.run(_collect(orchestrator, message="Hola"))

    assert captured["orchestrator_tools"] == {
        DELEGATE_TASK_NAME,
        "clarify",
        "ocr_menu_to_bulk_products",
    }


def test_workflow_orchestrator_fallback_when_no_content():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    orchestrator = WorkflowOrchestrator(settings=settings, rollout_skill_ids=("menu_read",))
    runtime = _runtime_bundle()

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        return FakeStreamedResult()

    with (
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.load_workflow_runtime",
            return_value=runtime,
        ),
        patch("app.modules.assistant.agent.workflow.orchestrator.schedule_persist_turn"),
        patch(
            "app.modules.assistant.agent.workflow.orchestrator.Runner.run_streamed",
            side_effect=fake_run_streamed,
        ),
    ):
        events = asyncio.run(_collect(orchestrator))

    assert events[-1].event == "message.complete"
    assert "No pude generar una respuesta" in events[-1].data["content"]


def _run_context(registry, restaurant_id: uuid.UUID, conversation_id: uuid.UUID) -> AssistantRunContext:
    return AssistantRunContext(
        agent_ctx=AgentContext(
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            uow=MagicMock(),
            effective_skill_ids=["menu_read"],
        ),
        registry=registry,
    )


def test_delegate_task_runs_catalog_agent():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    context = _workflow_context()
    registry = build_skill_registry(["menu_read"])
    execution = ExecutionRecord(summary="Hay 2 categorías: Tacos y Bebidas.", tools_used=["list_categories"])
    side_events: list[ChatStreamEvent] = []

    async def sink(event: ChatStreamEvent) -> None:
        side_events.append(event)

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "CatalogAgent":
            assert "Delegated task" in agent_input
            return FakeStreamedResult(final_output=execution)
        raise AssertionError(f"Unexpected agent: {name!r}")

    tool = build_delegate_task_tool(
        settings=settings,
        workflow_context=context,
        registry=registry,
        ops_run_context=_run_context(registry, context.restaurant_id, context.conversation_id),
        delegation_state=DelegationState(),
        event_sink=sink,
    )

    with patch(
        "app.modules.assistant.agent.workflow.delegate.Runner.run_streamed",
        side_effect=fake_run_streamed,
    ):
        result = asyncio.run(
            tool.on_invoke_tool(
                MagicMock(),
                json.dumps(
                    {
                        "subagent": "catalog_agent",
                        "task": "Listar categorías del menú",
                    }
                ),
            )
        )

    payload = json.loads(result)
    assert payload["ok"] is True
    assert "Tacos" in payload["execution"]["summary"]
    assert any(event.event == "agent.phase" and event.data["phase"] == "executing" for event in side_events)


def test_delegate_task_does_not_pass_clarify_tool_into_catalog_agent():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    context = _workflow_context()
    registry = build_skill_registry(["menu_read"])
    execution = ExecutionRecord(summary="Listo", tools_used=[])
    captured: dict[str, object] = {}

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        captured["catalog_tools"] = {tool.name for tool in agent.tools}
        return FakeStreamedResult(final_output=execution)

    tool = build_delegate_task_tool(
        settings=settings,
        workflow_context=context,
        registry=registry,
        ops_run_context=_run_context(registry, context.restaurant_id, context.conversation_id),
        delegation_state=DelegationState(),
    )

    with patch(
        "app.modules.assistant.agent.workflow.delegate.Runner.run_streamed",
        side_effect=fake_run_streamed,
    ):
        asyncio.run(
            tool.on_invoke_tool(
                MagicMock(),
                json.dumps({"subagent": "catalog_agent", "task": "Listar categorías"}),
            )
        )

    assert "clarify" not in captured["catalog_tools"]


def test_delegate_task_runs_operations_agent():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    context = _workflow_context()
    registry = build_skill_registry(["menu_write"])
    execution = ExecutionRecord(
        summary="Descripción actualizada.",
        tools_used=["update_restaurant_description"],
    )

    def fake_run_streamed(agent, agent_input, context=None, max_turns=1):  # noqa: ARG001
        name = getattr(agent, "name", "")
        if name == "OperationsAgent":
            assert "Delegated task" in agent_input
            return FakeStreamedResult(final_output=execution)
        raise AssertionError(f"Unexpected agent: {name!r}")

    tool = build_delegate_task_tool(
        settings=settings,
        workflow_context=context,
        registry=registry,
        ops_run_context=_run_context(registry, context.restaurant_id, context.conversation_id),
        delegation_state=DelegationState(),
    )

    with patch(
        "app.modules.assistant.agent.workflow.delegate.Runner.run_streamed",
        side_effect=fake_run_streamed,
    ):
        result = asyncio.run(
            tool.on_invoke_tool(
                MagicMock(),
                json.dumps(
                    {
                        "subagent": "operations_agent",
                        "task": "Actualizar la descripción del negocio",
                    }
                ),
            )
        )

    payload = json.loads(result)
    assert payload["ok"] is True
    assert "Descripción" in payload["execution"]["summary"]


def test_delegate_task_rejects_over_limit():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    context = _workflow_context()
    registry = build_skill_registry(["menu_read"])
    state = DelegationState()
    state.count = MAX_DELEGATIONS_PER_TURN

    tool = build_delegate_task_tool(
        settings=settings,
        workflow_context=context,
        registry=registry,
        ops_run_context=_run_context(registry, context.restaurant_id, context.conversation_id),
        delegation_state=state,
    )

    result = asyncio.run(
        tool.on_invoke_tool(
            MagicMock(),
            json.dumps({"subagent": "catalog_agent", "task": "Otra cosa"}),
        )
    )
    payload = json.loads(result)
    assert payload["ok"] is False
    assert "limit" in payload["summary"].lower() or "Delegation limit" in payload["summary"]


def test_delegate_task_rejects_menu_subagent():
    settings = Settings(openai_api_key="sk-test", langsmith_tracing=False)
    context = _workflow_context()
    registry = build_skill_registry(["menu_read"])

    tool = build_delegate_task_tool(
        settings=settings,
        workflow_context=context,
        registry=registry,
        ops_run_context=_run_context(registry, context.restaurant_id, context.conversation_id),
        delegation_state=DelegationState(),
    )

    result = asyncio.run(
        tool.on_invoke_tool(
            MagicMock(),
            json.dumps({"subagent": "menu_subagent", "task": "Importar menú"}),
        )
    )
    payload = json.loads(result)
    assert payload["ok"] is False
    assert "Invalid subagent" in payload["summary"]
    assert tool.name == DELEGATE_TASK_NAME
