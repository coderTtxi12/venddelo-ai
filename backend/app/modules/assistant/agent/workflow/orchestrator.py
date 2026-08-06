"""Orchestrator → delegate_task → subagents workflow."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import nullcontext

from agents import Runner
from langsmith import trace

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tracing import assistant_tracing_active
from app.modules.assistant.agent.tools import (
    build_orchestrator_function_tools,
)
from app.modules.assistant.agent.workflow.agents import build_orchestrator_agent
from app.modules.assistant.agent.workflow.clarify_registry import get_clarify_registry
from app.modules.assistant.agent.workflow.clarify_tool import build_clarify_tool
from app.modules.assistant.agent.workflow.context_loader import (
    load_workflow_runtime,
    orchestrator_input,
)
from app.modules.assistant.agent.workflow.delegate import (
    DELEGATE_TASK_NAME,
    DelegationState,
    build_delegate_task_tool,
)
from app.modules.assistant.agent.workflow.schemas import ORCHESTRATOR_MAX_TURNS
from app.modules.assistant.agent.workflow.sse import (
    agent_thought_event,
    phase_event,
)
from app.modules.assistant.agent.workflow.stream_mapping import map_agent_stream_event
from app.modules.assistant.agent.workflow.tracing_async import async_langsmith_root_trace
from app.modules.assistant.conversation_store import schedule_persist_turn
from app.modules.assistant.schemas import ChatAttachmentRef
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.registry import SkillRegistry

_FALLBACK_REPLY = "No pude generar una respuesta en este momento. Intenta de nuevo."
_STREAM_SENTINEL = object()


def _workflow_trace(name: str, *, settings: Settings):
    if assistant_tracing_active(settings):
        return trace(name, run_type="chain")
    return nullcontext()


class WorkflowOrchestrator:
    def __init__(
        self,
        *,
        settings: Settings,
        rollout_skill_ids: tuple[str, ...] | None = None,
    ) -> None:
        self._settings = settings
        self._rollout_skill_ids = rollout_skill_ids

    def _build_run_context(
        self,
        *,
        uow: SqlAlchemyUnitOfWork,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
        registry: SkillRegistry,
        effective_skill_ids: list[str],
    ) -> AssistantRunContext:
        agent_ctx = AgentContext(
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            uow=uow,
            effective_skill_ids=effective_skill_ids,
        )
        return AssistantRunContext(agent_ctx=agent_ctx, registry=registry)

    async def run_chat(
        self,
        *,
        uow: SqlAlchemyUnitOfWork,
        restaurant_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
        attachments: list[ChatAttachmentRef] | None = None,
    ) -> tuple[uuid.UUID, str]:
        content_parts: list[str] = []
        resolved_id: uuid.UUID | None = conversation_id

        async for event in self.stream_chat(
            uow=uow,
            restaurant_id=restaurant_id,
            message=message,
            conversation_id=conversation_id,
            attachments=attachments or [],
        ):
            if event.event == "content.delta":
                delta = event.data.get("delta")
                if isinstance(delta, str):
                    content_parts.append(delta)
            elif event.event == "message.complete":
                content = event.data.get("content")
                raw_id = event.data.get("conversation_id")
                if isinstance(raw_id, str) and raw_id.strip():
                    resolved_id = uuid.UUID(raw_id)
                if isinstance(content, str) and content.strip():
                    return resolved_id or uuid.uuid4(), content.strip()

        if resolved_id is None:
            raise ValueError("Assistant chat finished without a conversation id")
        return resolved_id, "".join(content_parts).strip()

    async def stream_chat(
        self,
        *,
        uow: SqlAlchemyUnitOfWork,
        restaurant_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
        attachments: list[ChatAttachmentRef] | None = None,
    ) -> AsyncIterator[ChatStreamEvent]:
        yield ChatStreamEvent(event="agent.status", data={"status": "processing"})
        yield phase_event("context")

        runtime = await load_workflow_runtime(
            uow=uow,
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            user_message=message,
            attachments=attachments or [],
            settings=self._settings,
            rollout_skill_ids=self._rollout_skill_ids,
        )
        workflow_context = runtime.context
        registry = runtime.registry
        resolved_conversation_id = runtime.conversation_id
        run_context = self._build_run_context(
            uow=uow,
            restaurant_id=restaurant_id,
            conversation_id=resolved_conversation_id,
            registry=registry,
            effective_skill_ids=workflow_context.effective_skill_ids,
        )

        trace_metadata = {
            "restaurant_id": str(restaurant_id),
            "conversation_id": str(resolved_conversation_id),
            "model": self._settings.openai_model,
            "skills": ",".join(workflow_context.effective_skill_ids),
            "workflow": "orchestrator_delegate",
        }

        content_parts: list[str] = []
        delegation_state = DelegationState()
        event_queue: asyncio.Queue[ChatStreamEvent | object] = asyncio.Queue()

        async def sink(event: ChatStreamEvent) -> None:
            await event_queue.put(event)

        clarify_registry = get_clarify_registry()
        clarify_tool = build_clarify_tool(
            settings=self._settings,
            conversation_id=resolved_conversation_id,
            registry=clarify_registry,
            event_sink=sink,
        )
        delegate_tool = build_delegate_task_tool(
            settings=self._settings,
            workflow_context=workflow_context,
            registry=registry,
            ops_run_context=run_context,
            delegation_state=delegation_state,
            event_sink=sink,
        )
        orchestrator_direct_tools = build_orchestrator_function_tools(
            registry,
            workflow_context.effective_skill_ids,
            settings=self._settings,
        )
        orchestrator = build_orchestrator_agent(
            settings=self._settings,
            tools=[delegate_tool, clarify_tool, *orchestrator_direct_tools],
        )

        async def emit() -> AsyncIterator[ChatStreamEvent]:
            yield phase_event("orchestrating")

            async def feed_orchestrator() -> None:
                streamed = Runner.run_streamed(
                    orchestrator,
                    orchestrator_input(workflow_context),
                    context=run_context,
                    max_turns=ORCHESTRATOR_MAX_TURNS,
                )
                with _workflow_trace("orchestrator", settings=self._settings):
                    async for event in streamed.stream_events():
                        mapped = map_agent_stream_event(
                            event,
                            registry=registry,
                            effective_skill_ids=workflow_context.effective_skill_ids,
                            include_text_deltas=True,
                        )
                        if mapped is None:
                            continue
                        if (
                            mapped.event == "tool.start"
                            and mapped.data.get("tool") == DELEGATE_TASK_NAME
                        ):
                            task_hint = mapped.data.get("args_summary")
                            if isinstance(task_hint, dict):
                                task_text = task_hint.get("task")
                                if isinstance(task_text, str) and task_text.strip():
                                    await event_queue.put(
                                        agent_thought_event(
                                            text=task_text.strip(),
                                            source="orchestrator",
                                        )
                                    )
                        await event_queue.put(mapped)
                await event_queue.put(_STREAM_SENTINEL)

            feed_task = asyncio.create_task(feed_orchestrator())
            try:
                while True:
                    item = await event_queue.get()
                    if item is _STREAM_SENTINEL:
                        break
                    assert isinstance(item, ChatStreamEvent)
                    if item.event == "content.delta":
                        delta = item.data.get("delta")
                        if isinstance(delta, str) and delta:
                            content_parts.append(delta)
                    yield item
            finally:
                if not feed_task.done():
                    feed_task.cancel()
                    try:
                        await feed_task
                    except asyncio.CancelledError:
                        pass
                else:
                    await feed_task

            final_output = "".join(content_parts).strip() or _FALLBACK_REPLY
            if not content_parts:
                content_parts.append(final_output)
                yield ChatStreamEvent(
                    event="content.delta",
                    data={"delta": final_output},
                )

            yield ChatStreamEvent(
                event="message.complete",
                data={
                    "conversation_id": str(resolved_conversation_id),
                    "content": final_output,
                },
            )

            if final_output:
                schedule_persist_turn(
                    conversation_id=resolved_conversation_id,
                    user_message=workflow_context.user_message,
                    assistant_message=final_output,
                )

        async with async_langsmith_root_trace(
            "assistant_chat",
            settings=self._settings,
            metadata=trace_metadata,
            inputs={"message": workflow_context.user_message},
            get_outputs=lambda: {
                "content": "".join(content_parts),
                "content_length": len(content_parts),
            },
        ):
            async for event in emit():
                yield event
