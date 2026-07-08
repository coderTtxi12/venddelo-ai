"""Explicit planner → executor → evaluator → replanner workflow orchestration."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import nullcontext

from agents import Agent, Runner
from agents.items import ToolCallItem
from agents.stream_events import RawResponsesStreamEvent, RunItemStreamEvent
from langsmith import trace
from openai.types.responses.response_text_delta_event import ResponseTextDeltaEvent

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tracing import assistant_tracing_active
from app.modules.assistant.agent.workflow.agents import (
    build_evaluator_agent,
    build_executor_agent,
    build_planner_agent,
    build_replanner_agent,
    build_responder_agent,
)
from app.modules.assistant.agent.workflow.context_loader import (
    WorkflowContext,
    evaluator_input,
    executor_input,
    load_workflow_runtime,
    planner_input,
    replanner_input,
    responder_input,
)
from app.modules.assistant.conversation_store import assistant_repository, persist_turn
from app.modules.assistant.schemas import ChatAttachmentRef
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    WorkflowEvaluation,
    WorkflowPlan,
    clear_execution_approval_gates,
    clear_plan_approval_gates,
)
from app.modules.assistant.agent.workflow.sse import (
    evaluation_event,
    phase_event,
    plan_event,
    step_events,
)
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.registry import SkillRegistry

MAX_REPLAN_ATTEMPTS = 2
EXECUTOR_MAX_TURNS = 12


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

        runtime = load_workflow_runtime(
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
            "workflow": "explicit_planner",
        }

        content_parts: list[str] = []

        async def emit() -> AsyncIterator[ChatStreamEvent]:
            planner = build_planner_agent(settings=self._settings)
            executor = build_executor_agent(
                settings=self._settings,
                registry=registry,
                effective_skill_ids=workflow_context.effective_skill_ids,
            )
            evaluator = build_evaluator_agent(settings=self._settings)
            replanner = build_replanner_agent(settings=self._settings)
            responder = build_responder_agent(settings=self._settings)

            yield phase_event("planning")
            plan = await self._run_planner(
                planner,
                planner_input(workflow_context),
                run_context,
            )

            execution = ExecutionRecord()
            evaluation = WorkflowEvaluation(ok=True, issues=[])

            if plan.is_direct:
                yield phase_event("responding")
                async for event in self._stream_responder(
                    responder,
                    workflow_context,
                    plan,
                    execution,
                    evaluation,
                    run_context,
                    content_parts,
                ):
                    yield event

                final_output = "".join(content_parts).strip()
                yield ChatStreamEvent(
                    event="message.complete",
                    data={
                        "conversation_id": str(resolved_conversation_id),
                        "content": final_output,
                    },
                )
                if final_output:
                    persist_turn(
                        assistant_repository(uow),
                        conversation_id=resolved_conversation_id,
                        user_message=workflow_context.user_message,
                        assistant_message=final_output,
                    )
                return

            yield plan_event(plan)

            for step_event in step_events(plan):
                yield step_event

            evaluation = WorkflowEvaluation(ok=False, should_replan=True, issues=["not started"])

            for replan_attempt in range(MAX_REPLAN_ATTEMPTS + 1):
                yield phase_event("executing")
                for step_event in step_events(plan, active_index=0):
                    yield step_event
                execution = await self._run_executor(
                    executor,
                    workflow_context,
                    plan,
                    run_context,
                )

                for step_event in step_events(plan, done_through=len(plan.steps) - 1):
                    yield step_event
                yield phase_event("evaluating")
                evaluation = await self._run_evaluator(
                    evaluator,
                    evaluator_input(workflow_context, plan, execution),
                    run_context,
                )
                yield evaluation_event(evaluation)

                if evaluation.ok:
                    break

                if not evaluation.should_replan or replan_attempt >= MAX_REPLAN_ATTEMPTS:
                    break

                yield phase_event("replanning")
                plan = await self._run_replanner(
                    replanner,
                    replanner_input(workflow_context, plan, execution, evaluation),
                    run_context,
                )
                yield plan_event(plan, replan=True)
                for step_event in step_events(plan):
                    yield step_event

            yield phase_event("responding")
            async for event in self._stream_responder(
                responder,
                workflow_context,
                plan,
                execution,
                evaluation,
                run_context,
                content_parts,
            ):
                yield event

            final_output = "".join(content_parts).strip()
            yield ChatStreamEvent(
                event="message.complete",
                data={
                    "conversation_id": str(resolved_conversation_id),
                    "content": final_output,
                },
            )

            if final_output:
                persist_turn(
                    assistant_repository(uow),
                    conversation_id=resolved_conversation_id,
                    user_message=workflow_context.user_message,
                    assistant_message=final_output,
                )

        if assistant_tracing_active(self._settings):
            with trace(
                "assistant_chat",
                run_type="chain",
                metadata=trace_metadata,
                inputs={"message": workflow_context.user_message},
                exceptions_to_handle=(GeneratorExit,),
            ) as run:
                try:
                    async for event in emit():
                        yield event
                finally:
                    run.end(outputs={"content": "".join(content_parts), "content_length": len(content_parts)})
        else:
            async for event in emit():
                yield event

    async def _run_planner(
        self,
        agent: Agent[AssistantRunContext],
        agent_input: str,
        run_context: AssistantRunContext,
    ) -> WorkflowPlan:
        result = await self._run_agent(agent, agent_input, run_context, trace_name="planner", max_turns=1)
        plan = result.final_output_as(WorkflowPlan, raise_if_incorrect_type=True)
        return clear_plan_approval_gates(plan)

    async def _run_evaluator(
        self,
        agent: Agent[AssistantRunContext],
        agent_input: str,
        run_context: AssistantRunContext,
    ) -> WorkflowEvaluation:
        result = await self._run_agent(agent, agent_input, run_context, trace_name="evaluator", max_turns=1)
        return result.final_output_as(WorkflowEvaluation, raise_if_incorrect_type=True)

    async def _run_replanner(
        self,
        agent: Agent[AssistantRunContext],
        agent_input: str,
        run_context: AssistantRunContext,
    ) -> WorkflowPlan:
        result = await self._run_agent(agent, agent_input, run_context, trace_name="replanner", max_turns=1)
        plan = result.final_output_as(WorkflowPlan, raise_if_incorrect_type=True)
        return clear_plan_approval_gates(plan)

    async def _run_agent(
        self,
        agent: Agent[AssistantRunContext],
        agent_input: str,
        run_context: AssistantRunContext,
        *,
        trace_name: str,
        max_turns: int,
    ) -> object:
        async def execute() -> object:
            return await Runner.run(
                agent,
                agent_input,
                context=run_context,
                max_turns=max_turns,
            )

        trace_ctx = trace(trace_name, run_type="chain") if assistant_tracing_active(self._settings) else nullcontext()
        with trace_ctx:
            return await execute()

    async def _run_executor(
        self,
        agent: Agent[AssistantRunContext],
        workflow_context: WorkflowContext,
        plan: WorkflowPlan,
        run_context: AssistantRunContext,
    ) -> ExecutionRecord:
        async def execute() -> object:
            return await Runner.run(
                agent,
                executor_input(workflow_context, plan),
                context=run_context,
                max_turns=EXECUTOR_MAX_TURNS,
            )

        trace_ctx = trace("executor", run_type="chain") if assistant_tracing_active(self._settings) else nullcontext()
        with trace_ctx:
            result = await execute()

        tools_used: list[str] = []
        for item in getattr(result, "new_items", []) or []:
            if isinstance(item, ToolCallItem):
                raw = item.raw_item
                name = getattr(raw, "name", None)
                if isinstance(name, str) and name:
                    tools_used.append(name)

        execution = result.final_output_as(ExecutionRecord, raise_if_incorrect_type=True)
        if not execution.summary.strip():
            execution.summary = "El executor terminó sin resumen textual."
        execution.tools_used = tools_used
        return clear_execution_approval_gates(execution)

    async def _stream_responder(
        self,
        agent: Agent[AssistantRunContext],
        workflow_context: WorkflowContext,
        plan: WorkflowPlan,
        execution: ExecutionRecord,
        evaluation: WorkflowEvaluation,
        run_context: AssistantRunContext,
        content_parts: list[str],
    ) -> AsyncIterator[ChatStreamEvent]:
        responder_input_text = responder_input(
            workflow_context,
            plan,
            execution,
            evaluation,
        )

        streamed = Runner.run_streamed(
            agent,
            responder_input_text,
            context=run_context,
            max_turns=1,
        )

        trace_ctx = trace("responder", run_type="chain") if assistant_tracing_active(self._settings) else nullcontext()

        with trace_ctx:
            async for event in streamed.stream_events():
                if isinstance(event, RawResponsesStreamEvent) and isinstance(
                    event.data, ResponseTextDeltaEvent
                ):
                    delta = event.data.delta
                    if delta:
                        content_parts.append(delta)
                        yield ChatStreamEvent(event="content.delta", data={"delta": delta})
                    continue

                if isinstance(event, RunItemStreamEvent) and event.name == "tool_called":
                    yield ChatStreamEvent(event="agent.status", data={"status": "processing"})
