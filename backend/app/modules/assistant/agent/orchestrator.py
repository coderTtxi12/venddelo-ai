from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Protocol

from app.core.config import Settings, get_settings
from app.core.llm.ports import (
    ChatCompletionMessage,
    ChatCompletionRequest,
    ChatStreamEvent,
    LLMProviderPort,
)
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.llm_turn import (
    AgentLLMParseContext,
    AgentLLMTurnResult,
    iter_agent_llm_turn,
)
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.agent.response_format import (
    AgentLLMResponse,
    PlanStep,
    apply_plan_update,
    build_tools_prompt_section,
)
from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.skills.base import ToolDefinition, ToolResult


class AgentSkillRegistry(Protocol):
    def registered_skill_ids(self) -> list[str]: ...

    def entitled_tools(
        self, effective_skill_ids: list[str]
    ) -> list[tuple[str, ToolDefinition]]: ...

    def system_prompt_sections(self, effective_skill_ids: list[str]) -> list[str]: ...

    def execute(
        self,
        skill_id: str,
        tool_name: str,
        args: dict[str, Any],
        ctx: AgentContext,
    ) -> ToolResult: ...


class AgentOrchestrator:
    def __init__(
        self,
        *,
        provider: LLMProviderPort,
        registry: AgentSkillRegistry,
        settings: Settings | None = None,
    ) -> None:
        self._provider = provider
        self._registry = registry
        self._settings = settings or get_settings()

    def stream_chat(
        self,
        request: AssistantChatRequest,
        *,
        profile: AssistantProfileRecord,
        ctx: AgentContext,
        message_id: str | None = None,
    ) -> Iterator[ChatStreamEvent]:
        _ = message_id
        agent_skill_ids = [
            skill_id
            for skill_id in ctx.effective_skill_ids
            if skill_id in self._registry.registered_skill_ids()
        ]
        entitled_tools = self._registry.entitled_tools(agent_skill_ids)
        system_prompt = self._compose_agent_system_prompt(
            profile,
            effective_skill_ids=agent_skill_ids,
            entitled_tools=entitled_tools,
        )

        yield ChatStreamEvent(event="agent.phase", data={"phase": "analyzing"})
        yield ChatStreamEvent(event="agent.status", data={"status": "processing"})

        messages = self._build_messages(
            request=request,
            system_prompt=system_prompt,
            user_message=request.message,
        )
        tool_iterations = 0
        max_tool_iterations = self._settings.assistant_max_tool_iterations
        planning_enabled = self._settings.assistant_planning_enabled
        reflection_enabled = self._settings.assistant_reflection_enabled
        reflection_every = self._settings.assistant_reflection_every
        max_replans = self._settings.assistant_max_replans
        # Bound *all* LLM turns (plan + reflections + tools + final answer) to cap cost.
        max_total_turns = max_tool_iterations + max_replans + 4
        parse_context = AgentLLMParseContext(
            known_skill_ids=set(agent_skill_ids),
            known_tool_names={tool.name for _, tool in entitled_tools},
        )

        plan: list[PlanStep] | None = None
        replans = 0
        tools_since_reflection = 0
        total_turns = 0

        while True:
            if total_turns >= max_total_turns:
                yield ChatStreamEvent(
                    event="error",
                    data={
                        "code": "turn_limit",
                        "message": "Se alcanzó el límite de pasos para este turno.",
                    },
                )
                return
            total_turns += 1

            turn = AgentLLMTurnResult()
            completion_request = ChatCompletionRequest(
                messages=messages,
                response_format="json_object",
            )
            yield from iter_agent_llm_turn(
                self._provider,
                completion_request,
                turn,
                parse_context=parse_context,
            )

            if turn.error == "invalid_llm_json":
                yield ChatStreamEvent(
                    event="error",
                    data={
                        "code": "invalid_llm_json",
                        "message": "El asistente devolvió un formato JSON inválido.",
                    },
                )
                return
            if turn.error:
                yield ChatStreamEvent(
                    event="error",
                    data={"code": "llm_provider_error", "message": turn.error},
                )
                return
            if turn.parsed is None:
                yield ChatStreamEvent(
                    event="error",
                    data={
                        "code": "invalid_llm_json",
                        "message": "El asistente devolvió un formato JSON inválido.",
                    },
                )
                return

            parsed = turn.parsed
            raw_response = turn.raw_response

            if parsed.type == "answer":
                return

            if parsed.type == "plan":
                plan = parsed.steps or []
                yield ChatStreamEvent(event="agent.phase", data={"phase": "planning"})
                yield ChatStreamEvent(
                    event="agent.plan",
                    data={
                        "steps": [step.model_dump() for step in plan],
                        "reason": parsed.reason,
                    },
                )
                messages.append(
                    ChatCompletionMessage(role="assistant", content=raw_response)
                )
                messages.append(
                    ChatCompletionMessage(
                        role="user",
                        content=(
                            "Plan recorded. Execute it step by step: emit a tool_call when you "
                            'need live data, or answer with type "answer" when done. '
                            "Do not invent data."
                        ),
                    )
                )
                continue

            if parsed.type == "plan_update":
                if parsed.decision == "replan" and replans < max_replans:
                    replans += 1
                    plan = apply_plan_update(plan, parsed)
                else:
                    # Cap replans: keep progress (completed steps) but ignore new steps.
                    plan = apply_plan_update(
                        plan,
                        AgentLLMResponse(
                            type="plan_update",
                            decision="continue",
                            completed_step_ids=parsed.completed_step_ids,
                        ),
                    )
                yield ChatStreamEvent(
                    event="agent.plan_update",
                    data={
                        "steps": [step.model_dump() for step in (plan or [])],
                        "decision": parsed.decision,
                        "reason": parsed.reason,
                    },
                )
                tools_since_reflection = 0
                messages.append(
                    ChatCompletionMessage(role="assistant", content=raw_response)
                )
                follow_up = (
                    'You have enough information. Respond now with type "answer". '
                    "Do not invent data."
                    if parsed.decision == "finish"
                    else (
                        "Continue with the next step: emit a tool_call if more live data is "
                        'needed, or answer with type "answer" if you are done.'
                    )
                )
                messages.append(ChatCompletionMessage(role="user", content=follow_up))
                continue

            if tool_iterations >= max_tool_iterations:
                yield ChatStreamEvent(
                    event="error",
                    data={
                        "code": "tool_iteration_limit",
                        "message": "Se alcanzó el límite de herramientas para este turno.",
                    },
                )
                return

            if not self._is_entitled_tool(parsed, entitled_tools):
                yield ChatStreamEvent(
                    event="error",
                    data={
                        "code": "tool_not_entitled",
                        "message": "El asistente intentó usar una herramienta no permitida.",
                    },
                )
                return

            tool_iterations += 1
            yield ChatStreamEvent(event="agent.phase", data={"phase": "explore"})
            if parsed.reason:
                yield ChatStreamEvent(
                    event="agent.thought",
                    data={"text": parsed.reason},
                )
            yield ChatStreamEvent(
                event="tool.start",
                data={
                    "tool": parsed.tool,
                    "skill_id": parsed.skill_id,
                    "args_summary": parsed.args,
                    "effect": self._tool_effect(parsed, entitled_tools),
                },
            )
            result = self._registry.execute(
                parsed.skill_id or "",
                parsed.tool or "",
                parsed.args,
                ctx,
            )
            event_name = "tool.result" if result.ok else "tool.error"
            yield ChatStreamEvent(
                event=event_name,
                data={
                    "tool": parsed.tool,
                    "ok": result.ok,
                    "summary": result.summary,
                },
            )
            messages.append(
                ChatCompletionMessage(
                    role="assistant",
                    content=raw_response,
                )
            )

            tools_since_reflection += 1
            should_reflect = planning_enabled and reflection_enabled and (
                not result.ok
                or (reflection_every > 0 and tools_since_reflection >= reflection_every)
            )
            if should_reflect:
                tools_since_reflection = 0

            messages.append(
                ChatCompletionMessage(
                    role="user",
                    content=self._post_tool_message(
                        owner_message=request.message,
                        result=result,
                        planning_enabled=planning_enabled,
                        reflect=should_reflect,
                    ),
                )
            )

    @staticmethod
    def _post_tool_message(
        *,
        owner_message: str,
        result: ToolResult,
        planning_enabled: bool,
        reflect: bool,
    ) -> str:
        result_json = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)
        if not planning_enabled:
            return (
                "Tool execution finished. Use the result below and respond with JSON "
                'type "answer". Do not invent data.\n\n'
                f"Original owner message: {owner_message}\n\n"
                f"Tool result JSON: {result_json}"
            )
        if reflect:
            instruction = (
                "Re-evaluate before continuing: emit a plan_update with completed_step_ids "
                "and a decision (continue / replan / finish). Include a new steps list only "
                "when you replan."
            )
        else:
            instruction = (
                "If the task is complete, respond with type \"answer\" (no invented data). "
                "If more steps remain, continue with another tool_call, or emit a plan_update "
                "to revise the plan."
            )
        return (
            f"Tool execution finished. {instruction}\n\n"
            f"Original owner message: {owner_message}\n\n"
            f"Tool result JSON: {result_json}"
        )

    def _compose_agent_system_prompt(
        self,
        profile: AssistantProfileRecord,
        *,
        effective_skill_ids: list[str],
        entitled_tools: list[tuple[str, ToolDefinition]],
    ) -> str:
        system_prompt = compose_system_prompt(profile, effective_skill_ids=effective_skill_ids)
        sections = self._registry.system_prompt_sections(effective_skill_ids)
        if sections:
            system_prompt = system_prompt + "\n\n---\n\n" + "\n\n".join(sections)
        system_prompt = system_prompt + "\n\n---\n\n" + build_tools_prompt_section(
            entitled_tools,
            planning_enabled=self._settings.assistant_planning_enabled,
            plan_max_steps=self._settings.assistant_plan_max_steps,
        )
        return system_prompt

    def _build_messages(
        self,
        *,
        request: AssistantChatRequest,
        system_prompt: str,
        user_message: str,
    ) -> list[ChatCompletionMessage]:
        compression = compress_history_for_llm(
            request.history,
            system_prompt=system_prompt,
            user_message=user_message,
            max_context_tokens=self._settings.assistant_context_max_tokens,
            threshold_ratio=self._settings.assistant_context_compression_threshold_ratio,
            recent_window_turns=self._settings.assistant_context_recent_window_turns,
        )
        history = (
            compression.history
            if self._settings.assistant_context_compression_enabled
            else request.history
        )
        messages: list[ChatCompletionMessage] = [
            ChatCompletionMessage(role="system", content=system_prompt),
        ]
        for item in history:
            messages.append(ChatCompletionMessage(role=item.role, content=item.content))
        messages.append(ChatCompletionMessage(role="user", content=user_message))
        return messages

    @staticmethod
    def _is_entitled_tool(
        parsed: AgentLLMResponse,
        entitled_tools: list[tuple[str, ToolDefinition]],
    ) -> bool:
        if parsed.type != "tool_call":
            return False
        return any(
            skill_id == parsed.skill_id and tool.name == parsed.tool
            for skill_id, tool in entitled_tools
        )

    @staticmethod
    def _tool_effect(
        parsed: AgentLLMResponse,
        entitled_tools: list[tuple[str, ToolDefinition]],
    ) -> str:
        for skill_id, tool in entitled_tools:
            if skill_id == parsed.skill_id and tool.name == parsed.tool:
                return tool.effect
        return "read"
