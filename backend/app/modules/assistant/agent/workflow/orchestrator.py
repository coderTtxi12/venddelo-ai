"""Router → executor → evaluator → responder workflow orchestration."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import nullcontext
from dataclasses import replace

from agents import Agent, Runner
from langsmith import trace

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tracing import assistant_tracing_active
from app.modules.assistant.agent.workflow.tracing_async import async_langsmith_root_trace
from app.modules.assistant.agent.workflow.agents import (
    build_evaluator_agent,
    build_executor_agent,
    build_responder_agent,
    build_router_agent,
)
from app.modules.assistant.agent.workflow.context_loader import (
    WorkflowContext,
    evaluator_input,
    executor_input,
    load_workflow_runtime,
    menu_import_input,
    menu_import_responder_input,
    responder_input,
    router_input,
)
from app.modules.assistant.conversation_store import schedule_persist_turn
from app.modules.assistant.schemas import ChatAttachmentRef
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    WorkflowEvaluation,
    WorkflowRouteDecision,
    adjust_evaluation_for_execution,
    clear_execution_approval_gates,
)
from app.modules.assistant.agent.workflow.sse import (
    agent_thought_event,
    evaluation_event,
    menu_import_quiz_event,
    phase_event,
)
from app.modules.assistant.agent.workflow.stream_mapping import (
    RouterReasonStreamParser,
    map_agent_stream_event,
    map_router_stream_event,
)
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.onboarding_agent import (
    build_menu_import_executor_agent,
    build_menu_import_responder_agent,
)
from app.modules.assistant.skills.menu_import.quiz_bridge import (
    format_menu_import_assistant_turn_for_history,
    open_questions_to_quiz,
)
from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizQuestion,
    MenuImportUserResponse,
)
from app.modules.assistant.skills.menu_import.session_context import (
    build_full_import_session_context,
    get_active_import_for_conversation,
)
from app.modules.assistant.skills.menu_import.session_draft_store import (
    list_open_questions,
    unanswered_question_ids,
)
from app.modules.assistant.skills.registry import SkillRegistry

MAX_EXECUTOR_RETRIES = 2
EXECUTOR_MAX_TURNS = 12
MENU_IMPORT_MAX_TURNS = 16


def _workflow_trace(name: str, *, settings: Settings):
    if assistant_tracing_active(settings):
        return trace(name, run_type="chain")
    return nullcontext()


def _pending_menu_import_quiz(session: object | None) -> list[MenuImportQuizQuestion]:
    if session is None:
        return []
    unanswered = set(unanswered_question_ids(session))
    if not unanswered:
        return []
    pending = [
        question
        for question in list_open_questions(session)
        if question.id in unanswered
    ]
    if not pending:
        return []
    return open_questions_to_quiz(pending)


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
        menu_import_registry = runtime.menu_import_registry
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
            "workflow": "router_executor",
        }

        content_parts: list[str] = []

        async def emit() -> AsyncIterator[ChatStreamEvent]:
            router = build_router_agent(settings=self._settings)
            executor = build_executor_agent(
                settings=self._settings,
                registry=registry,
                effective_skill_ids=workflow_context.effective_skill_ids,
            )
            evaluator = build_evaluator_agent(settings=self._settings)
            responder = build_responder_agent(settings=self._settings)

            yield phase_event("routing")
            route_box: list[WorkflowRouteDecision] = []
            async for event in self._stream_router(
                router,
                router_input(workflow_context),
                run_context,
                route_box,
            ):
                yield event
            route = route_box[0]

            execution = ExecutionRecord()
            evaluation = WorkflowEvaluation(ok=True, issues=[])

            if route.is_menu_import and workflow_context.menu_import_enabled and menu_import_registry:
                active_import = get_active_import_for_conversation(
                    uow,
                    restaurant_id=restaurant_id,
                    conversation_id=resolved_conversation_id,
                    fresh=True,
                )
                menu_import_context = replace(
                    workflow_context,
                    import_session_context=build_full_import_session_context(
                        active_import,
                        user_message=workflow_context.user_message,
                    ),
                )
                yield ChatStreamEvent(
                    event="agent.phase",
                    data={"phase": "executing", "label": "Importando menú"},
                )
                menu_import_response_box: list[MenuImportUserResponse] = []
                async for event in self._stream_menu_import(
                    build_menu_import_executor_agent(
                        settings=self._settings,
                        registry=menu_import_registry,
                    ),
                    build_menu_import_responder_agent(settings=self._settings),
                    menu_import_context,
                    route,
                    self._build_run_context(
                        uow=uow,
                        restaurant_id=restaurant_id,
                        conversation_id=resolved_conversation_id,
                        registry=menu_import_registry,
                        effective_skill_ids=["menu_import"],
                    ),
                    menu_import_registry,
                    content_parts,
                    menu_import_response_box,
                    restaurant_id=restaurant_id,
                    uow=uow,
                ):
                    yield event

                response = (
                    menu_import_response_box[0]
                    if menu_import_response_box
                    else MenuImportUserResponse(message="".join(content_parts).strip())
                )
                final_output = response.message.strip() or "".join(content_parts).strip()
                complete_data: dict[str, object] = {
                    "conversation_id": str(resolved_conversation_id),
                    "content": final_output,
                }
                if response.questions:
                    complete_data["menu_import"] = {
                        "questions": [
                            question.model_dump() for question in response.questions
                        ],
                    }
                yield ChatStreamEvent(event="message.complete", data=complete_data)
                persisted_assistant_message = format_menu_import_assistant_turn_for_history(
                    final_output,
                    response.questions,
                )
                if persisted_assistant_message:
                    schedule_persist_turn(
                        conversation_id=resolved_conversation_id,
                        user_message=workflow_context.user_message,
                        assistant_message=persisted_assistant_message,
                    )
                return

            if route.is_direct:
                yield phase_event("responding")
                async for event in self._stream_responder(
                    responder,
                    workflow_context,
                    route,
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
                    schedule_persist_turn(
                        conversation_id=resolved_conversation_id,
                        user_message=workflow_context.user_message,
                        assistant_message=final_output,
                    )
                return

            evaluation = WorkflowEvaluation(ok=False, should_replan=True, issues=["not started"])

            for attempt in range(MAX_EXECUTOR_RETRIES + 1):
                yield phase_event("executing")
                execution_box: list[ExecutionRecord] = []
                async for event in self._stream_executor(
                    executor,
                    workflow_context,
                    route,
                    run_context,
                    registry,
                    previous_execution=execution if attempt > 0 else None,
                    evaluation=evaluation if attempt > 0 else None,
                    execution_box=execution_box,
                ):
                    yield event
                execution = execution_box[0]

                yield phase_event("evaluating")
                evaluation = await self._run_evaluator(
                    evaluator,
                    evaluator_input(workflow_context, route, execution),
                    run_context,
                )
                evaluation = adjust_evaluation_for_execution(evaluation, execution)
                yield evaluation_event(evaluation)

                if evaluation.ok:
                    break

                if not evaluation.should_replan or attempt >= MAX_EXECUTOR_RETRIES:
                    break

            yield phase_event("responding")
            async for event in self._stream_responder(
                responder,
                workflow_context,
                route,
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

    async def _stream_router(
        self,
        agent: Agent[AssistantRunContext],
        agent_input: str,
        run_context: AssistantRunContext,
        route_box: list[WorkflowRouteDecision],
    ) -> AsyncIterator[ChatStreamEvent]:
        streamed = Runner.run_streamed(
            agent,
            agent_input,
            context=run_context,
            max_turns=1,
        )

        trace_ctx = _workflow_trace("router", settings=self._settings)
        reason_parser = RouterReasonStreamParser()

        with trace_ctx:
            async for event in streamed.stream_events():
                mapped = map_router_stream_event(event, reason_parser=reason_parser)
                if mapped is not None:
                    yield mapped

            route = streamed.final_output_as(WorkflowRouteDecision, raise_if_incorrect_type=True)
            route_box.append(route)
            final_reason = route.reason.strip()
            if final_reason and final_reason != reason_parser.emitted_reason:
                yield agent_thought_event(text=final_reason, source="router")

    async def _run_evaluator(
        self,
        agent: Agent[AssistantRunContext],
        agent_input: str,
        run_context: AssistantRunContext,
    ) -> WorkflowEvaluation:
        result = await self._run_agent(agent, agent_input, run_context, trace_name="evaluator", max_turns=1)
        return result.final_output_as(WorkflowEvaluation, raise_if_incorrect_type=True)

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

        trace_ctx = _workflow_trace(trace_name, settings=self._settings)
        with trace_ctx:
            return await execute()

    async def _stream_executor(
        self,
        agent: Agent[AssistantRunContext],
        workflow_context: WorkflowContext,
        route: WorkflowRouteDecision,
        run_context: AssistantRunContext,
        registry: SkillRegistry,
        *,
        previous_execution: ExecutionRecord | None = None,
        evaluation: WorkflowEvaluation | None = None,
        execution_box: list[ExecutionRecord],
    ) -> AsyncIterator[ChatStreamEvent]:
        streamed = Runner.run_streamed(
            agent,
            executor_input(
                workflow_context,
                route,
                previous_execution=previous_execution,
                evaluation=evaluation,
            ),
            context=run_context,
            max_turns=EXECUTOR_MAX_TURNS,
        )

        tools_used: list[str] = []
        trace_ctx = _workflow_trace("executor", settings=self._settings)

        with trace_ctx:
            async for event in streamed.stream_events():
                mapped = map_agent_stream_event(
                    event,
                    registry=registry,
                    effective_skill_ids=workflow_context.effective_skill_ids,
                    include_text_deltas=False,
                )
                if mapped is not None:
                    if mapped.event == "tool.start" and isinstance(mapped.data.get("tool"), str):
                        tools_used.append(mapped.data["tool"])
                    yield mapped

            result = streamed
            execution = result.final_output_as(ExecutionRecord, raise_if_incorrect_type=True)
            if not execution.summary.strip():
                execution.summary = "El executor terminó sin resumen textual."
            if not execution.tools_used:
                execution.tools_used = tools_used
            execution_box.append(clear_execution_approval_gates(execution))

    async def _stream_menu_import(
        self,
        executor: Agent[AssistantRunContext],
        responder: Agent[AssistantRunContext],
        workflow_context: WorkflowContext,
        route: WorkflowRouteDecision,
        run_context: AssistantRunContext,
        registry: SkillRegistry,
        content_parts: list[str],
        response_box: list[MenuImportUserResponse],
        *,
        restaurant_id: uuid.UUID,
        uow: SqlAlchemyUnitOfWork,
    ) -> AsyncIterator[ChatStreamEvent]:
        executor_streamed = Runner.run_streamed(
            executor,
            menu_import_input(workflow_context, route),
            context=run_context,
            max_turns=MENU_IMPORT_MAX_TURNS,
        )

        trace_ctx = _workflow_trace("menu_import_executor", settings=self._settings)
        execution = ExecutionRecord()

        with trace_ctx:
            async for event in executor_streamed.stream_events():
                mapped = map_agent_stream_event(
                    event,
                    registry=registry,
                    effective_skill_ids=["menu_import"],
                    include_text_deltas=False,
                )
                if mapped is not None:
                    yield mapped

            execution = clear_execution_approval_gates(
                executor_streamed.final_output_as(ExecutionRecord, raise_if_incorrect_type=True)
            )

        yield ChatStreamEvent(
            event="agent.phase",
            data={"phase": "responding", "label": "Preparando respuesta"},
        )

        active_import = get_active_import_for_conversation(
            uow,
            restaurant_id=restaurant_id,
            conversation_id=workflow_context.conversation_id,
            fresh=True,
        )
        quiz_questions = _pending_menu_import_quiz(active_import)
        responder_context = replace(
            workflow_context,
            import_session_context=build_full_import_session_context(
                active_import,
                user_message=workflow_context.user_message,
            ),
        )

        responder_streamed = Runner.run_streamed(
            responder,
            menu_import_responder_input(
                responder_context,
                route,
                execution,
                pending_quiz=quiz_questions or None,
            ),
            context=run_context,
            max_turns=1,
        )

        responder_trace = _workflow_trace("menu_import_responder", settings=self._settings)

        with responder_trace:
            async for event in responder_streamed.stream_events():
                mapped = map_agent_stream_event(
                    event,
                    registry=registry,
                    effective_skill_ids=["menu_import"],
                    include_text_deltas=False,
                )
                if mapped is None:
                    continue
                yield mapped

            response = responder_streamed.final_output_as(
                MenuImportUserResponse,
                raise_if_incorrect_type=True,
            )
            if quiz_questions and not response.questions:
                response = response.model_copy(update={"questions": quiz_questions})
            response_box.append(response)

            if response.questions:
                yield menu_import_quiz_event(response.questions)

            if response.message:
                content_parts.clear()
                content_parts.append(response.message)
                yield ChatStreamEvent(
                    event="content.delta",
                    data={"delta": response.message},
                )

    async def _stream_responder(
        self,
        agent: Agent[AssistantRunContext],
        workflow_context: WorkflowContext,
        route: WorkflowRouteDecision,
        execution: ExecutionRecord,
        evaluation: WorkflowEvaluation,
        run_context: AssistantRunContext,
        content_parts: list[str],
    ) -> AsyncIterator[ChatStreamEvent]:
        responder_input_text = responder_input(
            workflow_context,
            route,
            execution,
            evaluation,
        )

        streamed = Runner.run_streamed(
            agent,
            responder_input_text,
            context=run_context,
            max_turns=1,
        )

        trace_ctx = _workflow_trace("responder", settings=self._settings)

        with trace_ctx:
            async for event in streamed.stream_events():
                mapped = map_agent_stream_event(
                    event,
                    registry=run_context.registry,
                    effective_skill_ids=run_context.agent_ctx.effective_skill_ids,
                    include_text_deltas=True,
                )
                if mapped is None:
                    continue
                if mapped.event == "content.delta":
                    delta = mapped.data.get("delta")
                    if isinstance(delta, str) and delta:
                        content_parts.append(delta)
                yield mapped
