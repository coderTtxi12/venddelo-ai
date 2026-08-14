"""delegate_task tool: Orchestrator → catalog_agent | operations_agent."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

from agents import FunctionTool, RunContextWrapper, Runner

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.workflow.agents import (
    build_catalog_agent,
    build_operations_agent,
)
from app.modules.assistant.agent.workflow.context_loader import (
    WorkflowContext,
    catalog_agent_input,
    operations_agent_input,
)
from app.modules.assistant.agent.workflow.schemas import (
    MAX_DELEGATIONS_PER_TURN,
    CATALOG_AGENT_MAX_TURNS,
    OPERATIONS_AGENT_MAX_TURNS,
    DelegateSubagent,
    ExecutionRecord,
    clear_execution_approval_gates,
)
from app.modules.assistant.agent.workflow.sse import phase_event
from app.modules.assistant.agent.workflow.stream_mapping import map_agent_stream_event
from app.modules.assistant.skills.registry import SkillRegistry

EventSink = Callable[[ChatStreamEvent], Awaitable[None] | None]

DELEGATE_TASK_NAME = "delegate_task"

_VALID_SUBAGENTS = frozenset({"catalog_agent", "operations_agent"})

_DELEGATE_PARAMS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "subagent": {
            "type": "string",
            "enum": ["catalog_agent", "operations_agent"],
            "description": "Which subagent should handle this task",
        },
        "task": {
            "type": "string",
            "minLength": 1,
            "description": (
                "Specific spanish goal for the subagent this turn. Based only on the user intent, don't go beyond the user inetent or invent information."
            ),
        },
        "context": {
            "type": "string",
            "description": (
                "Background information the subagent needs: context that will help the subagent accomplish the task."
                "error messages, etc. The more "
                "specific you are, the better the subagent performs. Don't invent information."
            ),
        },
    },
    "required": ["subagent", "task"],
    "additionalProperties": False,
}


class DelegationState:
    """Mutable per-turn counters for delegate_task."""

    __slots__ = ("count",)

    def __init__(self) -> None:
        self.count = 0


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
    ops_run_context: AssistantRunContext,
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
        if subagent_raw not in _VALID_SUBAGENTS:
            return json.dumps(
                {
                    "ok": False,
                    "summary": (
                        "Invalid subagent. Use catalog_agent or operations_agent."
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
                        "Answer the user with the information you already have."
                    ),
                },
                ensure_ascii=False,
            )
        delegation_state.count += 1

        if subagent == "operations_agent":
            return await _run_operations_agent(
                settings=settings,
                workflow_context=workflow_context,
                registry=registry,
                ops_run_context=ops_run_context,
                task=task.strip(),
                event_sink=event_sink,
            )

        return await _run_catalog_agent(
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
            "catalog_agent handles live menu catalog work; "
            "operations_agent handles business profile, branding (logo/cover), "
            "hours, location, payments, and QR."
        ),
        params_json_schema=_DELEGATE_PARAMS_SCHEMA,
        on_invoke_tool=on_invoke_tool,
    )


async def _run_subagent_execution(
    *,
    agent: Any,
    agent_input: str,
    run_context: AssistantRunContext,
    max_turns: int,
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    event_sink: EventSink | None,
    empty_summary: str,
) -> str:
    streamed = Runner.run_streamed(
        agent,
        agent_input,
        context=run_context,
        max_turns=max_turns,
    )
    tools_used: list[str] = []
    async for event in streamed.stream_events():
        mapped = map_agent_stream_event(
            event,
            registry=registry,
            effective_skill_ids=effective_skill_ids,
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
        execution.summary = empty_summary
    if not execution.tools_used:
        execution.tools_used = tools_used
    return json.dumps(
        {"ok": True, "execution": execution.model_dump(mode="json")},
        ensure_ascii=False,
        default=str,
    )


async def _run_catalog_agent(
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
        phase_event("executing", label="Ejecutando catálogo"),
    )
    agent = build_catalog_agent(
        settings=settings,
        registry=registry,
        effective_skill_ids=workflow_context.effective_skill_ids,
    )
    return await _run_subagent_execution(
        agent=agent,
        agent_input=catalog_agent_input(workflow_context, task),
        run_context=ops_run_context,
        max_turns=CATALOG_AGENT_MAX_TURNS,
        registry=registry,
        effective_skill_ids=workflow_context.effective_skill_ids,
        event_sink=event_sink,
        empty_summary="El catalog_agent terminó sin resumen textual.",
    )


async def _run_operations_agent(
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
    agent = build_operations_agent(
        settings=settings,
        registry=registry,
        effective_skill_ids=workflow_context.effective_skill_ids,
    )
    return await _run_subagent_execution(
        agent=agent,
        agent_input=operations_agent_input(workflow_context, task),
        run_context=ops_run_context,
        max_turns=OPERATIONS_AGENT_MAX_TURNS,
        registry=registry,
        effective_skill_ids=workflow_context.effective_skill_ids,
        event_sink=event_sink,
        empty_summary="El operations_agent terminó sin resumen textual.",
    )
