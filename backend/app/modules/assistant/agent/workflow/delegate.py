"""delegate_task tool: Orchestrator → restaurant_ops_subagent | menu_subagent."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from agents import FunctionTool, RunContextWrapper, Runner

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.workflow.agents import build_restaurant_ops_subagent
from app.modules.assistant.agent.workflow.context_loader import (
    WorkflowContext,
    menu_subagent_input,
    restaurant_ops_input,
)
from app.modules.assistant.agent.workflow.schemas import (
    MAX_DELEGATIONS_PER_TURN,
    MENU_SUBAGENT_MAX_TURNS,
    RESTAURANT_OPS_MAX_TURNS,
    DelegateSubagent,
    ExecutionRecord,
    clear_execution_approval_gates,
)
from app.modules.assistant.agent.workflow.sse import phase_event
from app.modules.assistant.agent.workflow.stream_mapping import map_agent_stream_event
from app.modules.assistant.skills.menu_import.onboarding_agent import build_menu_subagent
from app.modules.assistant.skills.menu_import.public_menu_url import (
    build_public_menu_url,
    should_inject_public_menu_url_for_responder,
)
from app.modules.assistant.skills.menu_import.quiz_bridge import open_questions_to_quiz
from app.modules.assistant.skills.menu_import.session_context import (
    get_active_import_for_conversation,
)
from app.modules.assistant.skills.menu_import.session_draft_store import (
    list_open_questions,
    unanswered_question_ids,
)
from app.modules.assistant.skills.registry import SkillRegistry
from app.modules.restaurants.service import RestaurantService

EventSink = Callable[[ChatStreamEvent], Awaitable[None] | None]

DELEGATE_TASK_NAME = "delegate_task"

_DELEGATE_PARAMS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "subagent": {
            "type": "string",
            "enum": ["restaurant_ops_subagent", "menu_subagent"],
            "description": "Which subagent should handle this task",
        },
        "task": {
            "type": "string",
            "minLength": 1,
            "description": "Spanish goal for the subagent this turn",
        },
    },
    "required": ["subagent", "task"],
    "additionalProperties": False,
}


class DelegationState:
    """Mutable per-turn counters and flags for delegate_task."""

    __slots__ = ("count", "used_menu_subagent", "last_quiz_questions")

    def __init__(self) -> None:
        self.count = 0
        self.used_menu_subagent = False
        self.last_quiz_questions: list[dict[str, Any]] = []


async def _emit(sink: EventSink | None, event: ChatStreamEvent) -> None:
    if sink is None:
        return
    result = sink(event)
    if asyncio.iscoroutine(result) or isinstance(result, Awaitable):
        await result  # type: ignore[misc]


def build_delegate_task_tool(
    *,
    settings: Settings,
    workflow_context: WorkflowContext,
    registry: SkillRegistry,
    menu_import_registry: SkillRegistry | None,
    uow: SqlAlchemyUnitOfWork,
    restaurant_id: uuid.UUID,
    ops_run_context: AssistantRunContext,
    menu_run_context: AssistantRunContext | None,
    delegation_state: DelegationState,
    event_sink: EventSink | None = None,
) -> FunctionTool:
    async def on_invoke_tool(
        ctx: RunContextWrapper[AssistantRunContext],  # noqa: ARG001
        args: str,
    ) -> str:
        parsed = json.loads(args) if args else {}
        if not isinstance(parsed, dict):
            parsed = {}
        subagent_raw = parsed.get("subagent")
        task = parsed.get("task")
        if subagent_raw not in ("restaurant_ops_subagent", "menu_subagent"):
            return json.dumps(
                {
                    "ok": False,
                    "summary": (
                        "Invalid subagent. Use restaurant_ops_subagent or menu_subagent."
                    ),
                },
                ensure_ascii=False,
            )
        if not isinstance(task, str) or not task.strip():
            return json.dumps(
                {"ok": False, "summary": "task must be a non-empty string."},
                ensure_ascii=False,
            )

        subagent: DelegateSubagent = subagent_raw  # type: ignore[assignment]
        if delegation_state.count >= MAX_DELEGATIONS_PER_TURN:
            return json.dumps(
                {
                    "ok": False,
                    "summary": (
                        f"Delegation limit reached ({MAX_DELEGATIONS_PER_TURN} per turn). "
                        "Answer the owner with the information you already have."
                    ),
                },
                ensure_ascii=False,
            )
        delegation_state.count += 1

        if subagent == "menu_subagent":
            return await _run_menu_subagent(
                settings=settings,
                workflow_context=workflow_context,
                menu_import_registry=menu_import_registry,
                menu_run_context=menu_run_context,
                uow=uow,
                restaurant_id=restaurant_id,
                task=task.strip(),
                delegation_state=delegation_state,
                event_sink=event_sink,
            )

        return await _run_restaurant_ops_subagent(
            settings=settings,
            workflow_context=workflow_context,
            registry=registry,
            ops_run_context=ops_run_context,
            task=task.strip(),
            event_sink=event_sink,
        )

    return FunctionTool(
        name=DELEGATE_TASK_NAME,
        description=(
            "Delegate work to a specialist subagent. "
            "restaurant_ops_subagent handles live menu and restaurant operations; "
            "menu_subagent handles full menu import / digital menu onboarding."
        ),
        params_json_schema=_DELEGATE_PARAMS_SCHEMA,
        on_invoke_tool=on_invoke_tool,
    )


async def _run_restaurant_ops_subagent(
    *,
    settings: Settings,
    workflow_context: WorkflowContext,
    registry: SkillRegistry,
    ops_run_context: AssistantRunContext,
    task: str,
    event_sink: EventSink | None,
) -> str:
    await _emit(
        event_sink,
        phase_event("executing", label="Ejecutando operaciones"),
    )
    agent = build_restaurant_ops_subagent(
        settings=settings,
        registry=registry,
        effective_skill_ids=workflow_context.effective_skill_ids,
    )
    streamed = Runner.run_streamed(
        agent,
        restaurant_ops_input(workflow_context, task),
        context=ops_run_context,
        max_turns=RESTAURANT_OPS_MAX_TURNS,
    )
    tools_used: list[str] = []
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
            await _emit(event_sink, mapped)

    execution = clear_execution_approval_gates(
        streamed.final_output_as(ExecutionRecord, raise_if_incorrect_type=True)
    )
    if not execution.summary.strip():
        execution.summary = "El subagent de operaciones terminó sin resumen textual."
    if not execution.tools_used:
        execution.tools_used = tools_used
    return json.dumps(
        {"ok": True, "execution": execution.model_dump(mode="json")},
        ensure_ascii=False,
        default=str,
    )


async def _run_menu_subagent(
    *,
    settings: Settings,
    workflow_context: WorkflowContext,
    menu_import_registry: SkillRegistry | None,
    menu_run_context: AssistantRunContext | None,
    uow: SqlAlchemyUnitOfWork,
    restaurant_id: uuid.UUID,
    task: str,
    delegation_state: DelegationState,
    event_sink: EventSink | None,
) -> str:
    if not workflow_context.menu_import_enabled or menu_import_registry is None or menu_run_context is None:
        return json.dumps(
            {
                "ok": False,
                "summary": "Menu import is not available for this restaurant right now.",
            },
            ensure_ascii=False,
        )

    delegation_state.used_menu_subagent = True
    await _emit(
        event_sink,
        phase_event("executing", label="Importando menú"),
    )
    agent = build_menu_subagent(settings=settings, registry=menu_import_registry)
    streamed = Runner.run_streamed(
        agent,
        menu_subagent_input(workflow_context, task),
        context=menu_run_context,
        max_turns=MENU_SUBAGENT_MAX_TURNS,
    )
    tools_used: list[str] = []
    async for event in streamed.stream_events():
        mapped = map_agent_stream_event(
            event,
            registry=menu_import_registry,
            effective_skill_ids=["menu_import"],
            include_text_deltas=False,
        )
        if mapped is not None:
            if mapped.event == "tool.start" and isinstance(mapped.data.get("tool"), str):
                tools_used.append(mapped.data["tool"])
            await _emit(event_sink, mapped)

    execution = clear_execution_approval_gates(
        streamed.final_output_as(ExecutionRecord, raise_if_incorrect_type=True)
    )
    if not execution.summary.strip():
        execution.summary = "El menu_subagent terminó sin resumen textual."
    if not execution.tools_used:
        execution.tools_used = tools_used

    active_import = get_active_import_for_conversation(
        uow,
        restaurant_id=restaurant_id,
        conversation_id=workflow_context.conversation_id,
        fresh=True,
    )
    quiz_questions = _pending_menu_import_quiz(active_import)
    if quiz_questions:
        delegation_state.last_quiz_questions = [
            question.model_dump() for question in quiz_questions
        ]

    public_menu_url: str | None = None
    if should_inject_public_menu_url_for_responder(
        active_import,
        pending_quiz=bool(quiz_questions),
        execution_status=execution.status,
        tools_used=execution.tools_used,
    ):
        restaurant = RestaurantService(uow.restaurants).get(restaurant_id)
        url = build_public_menu_url(restaurant.subdomain, settings=settings)
        if url:
            public_menu_url = url

    payload: dict[str, Any] = {
        "ok": True,
        "execution": execution.model_dump(mode="json"),
    }
    if public_menu_url:
        payload["public_menu_url"] = public_menu_url
    if quiz_questions:
        payload["pending_quiz_count"] = len(quiz_questions)
    return json.dumps(payload, ensure_ascii=False, default=str)


def _pending_menu_import_quiz(session: object | None) -> list:
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
