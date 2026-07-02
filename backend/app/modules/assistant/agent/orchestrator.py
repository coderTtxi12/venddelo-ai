"""Single-loop agent orchestrator using native function/tool calling.

The model receives the entitled skills' tools as native function schemas plus a
generic ``load_skill`` tool for progressive disclosure of skill guides. Each turn
the model either calls tools (which we execute and feed back as ``tool`` messages)
or replies with a normal assistant message (the final answer, streamed live).

There is no custom JSON envelope, no forced router/plan/activate phases, and no
JSON repair: the provider parses tool calls natively.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Protocol

from langsmith import trace

from app.core.config import Settings, get_settings
from app.core.llm.ports import (
    ChatCompletionMessage,
    ChatCompletionRequest,
    ChatStreamEvent,
    LLMProviderPort,
)
from app.modules.assistant.agent.activity_emit import (
    mark_plan_step_done,
    normalize_llm_reasoning,
    phase_for_effect,
    plan_steps_for_calls,
)
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.agent.response_format import (
    LOAD_SKILL_TOOL_NAME,
    build_agent_runtime_section,
    build_load_skill_schema,
    build_openai_tool_schemas,
    parse_agent_response,
    parse_function_name,
)
from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.entitlements.catalog import SKILL_CATALOG
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.skills.base import ToolDefinition, ToolResult


def _skill_label(skill_id: str) -> str:
    definition = SKILL_CATALOG.get(skill_id)
    return definition.label if definition else skill_id


def _yield_parsed_final_message(
    raw_content: str,
    *,
    usage_payload: Any,
    content_parts: list[str],
) -> Iterator[ChatStreamEvent]:
    """Parse the JSON envelope and emit owner-facing stream events."""
    parsed = parse_agent_response(raw_content)
    reasoning = parsed["reasoning"]
    content = parsed["content"]
    if content:
        content_parts.append(content)
    if reasoning:
        yield ChatStreamEvent(
            event="agent.thought",
            data={"text": reasoning, "replace": False},
        )
    if content:
        yield ChatStreamEvent(event="content.delta", data={"delta": content})
    yield ChatStreamEvent(
        event="message.complete",
        data={
            "content": content,
            "reasoning": reasoning,
            "usage": usage_payload,
        },
    )


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
        catalog_skill_ids = list(ctx.effective_skill_ids)
        registered = set(self._registry.registered_skill_ids())
        entitled_skill_ids = [s for s in catalog_skill_ids if s in registered]
        entitled_tools = self._registry.entitled_tools(entitled_skill_ids)
        tool_index: dict[tuple[str, str], ToolDefinition] = {
            (skill_id, tool.name): tool for skill_id, tool in entitled_tools
        }

        system_prompt = (
            compose_system_prompt(profile, effective_skill_ids=catalog_skill_ids)
            + "\n\n---\n\n"
            + build_agent_runtime_section()
        )
        tool_schemas = build_openai_tool_schemas(entitled_tools)
        if entitled_skill_ids:
            tool_schemas.append(build_load_skill_schema(entitled_skill_ids))
        tools_enabled = bool(tool_schemas)

        messages = self._build_messages(
            request=request,
            system_prompt=system_prompt,
            user_message=request.message,
        )

        max_tool_iterations = self._settings.assistant_max_tool_iterations
        max_total_turns = max_tool_iterations + 5
        tool_iterations = 0
        total_turns = 0
        content_parts: list[str] = []
        loaded_skill_ids: list[str] = []

        trace_metadata = {
            "message_id": message_id,
            "restaurant_id": str(ctx.restaurant_id),
            "conversation_id": str(ctx.conversation_id),
            "entitled_skill_ids": entitled_skill_ids,
        }

        with trace(
            "agent_chat",
            run_type="chain",
            metadata=trace_metadata,
            inputs={"message": request.message},
            exceptions_to_handle=(GeneratorExit,),
        ) as agent_run:
            try:
                yield ChatStreamEvent(event="agent.phase", data={"phase": "analyzing"})
                yield ChatStreamEvent(event="agent.status", data={"status": "processing"})

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

                    completion_request = ChatCompletionRequest(
                        messages=messages,
                        tools=tool_schemas or None,
                    )

                    turn_content: list[str] = []
                    turn_reasoning: list[str] = []
                    thought_started_this_turn = False
                    tool_calls: list[dict[str, Any]] | None = None
                    final_content = ""
                    usage_payload: Any = None

                    stream_failed = False
                    for event in self._provider.stream_chat(completion_request):
                        if event.event == "content.delta":
                            delta = event.data.get("delta")
                            if isinstance(delta, str) and delta:
                                if tools_enabled:
                                    turn_reasoning.append(delta)
                                    reasoning = normalize_llm_reasoning(
                                        "".join(turn_reasoning)
                                    )
                                    if reasoning:
                                        yield ChatStreamEvent(
                                            event="agent.thought",
                                            data={
                                                "text": reasoning,
                                                "replace": thought_started_this_turn,
                                            },
                                        )
                                        thought_started_this_turn = True
                                else:
                                    turn_content.append(delta)
                            continue
                        if event.event == "error":
                            yield event
                            stream_failed = True
                            break
                        if event.event == "message.complete":
                            tool_calls = event.data.get("tool_calls") or None
                            provider_content = event.data.get("content")
                            final_content = (
                                provider_content
                                if isinstance(provider_content, str) and provider_content
                                else "".join(turn_content or turn_reasoning)
                            )
                            usage_payload = event.data.get("usage")
                    if stream_failed:
                        return

                    if not tool_calls:
                        yield from _yield_parsed_final_message(
                            final_content,
                            usage_payload=usage_payload,
                            content_parts=content_parts,
                        )
                        return

                    turn_reasoning_text = normalize_llm_reasoning(final_content)
                    if turn_reasoning_text:
                        yield ChatStreamEvent(
                            event="agent.thought",
                            data={
                                "text": turn_reasoning_text,
                                "replace": thought_started_this_turn,
                            },
                        )

                    # Echo the assistant turn (content + tool calls) back into history.
                    messages.append(
                        ChatCompletionMessage(
                            role="assistant",
                            content=final_content or None,
                            tool_calls=tool_calls,
                        )
                    )

                    plan_steps: list[dict[str, Any]] = []
                    if len(tool_calls) > 1:
                        plan_steps = plan_steps_for_calls(tool_calls)
                        yield ChatStreamEvent(
                            event="agent.plan",
                            data={
                                "reason": (
                                    turn_reasoning_text
                                    or "Pasos para completar tu solicitud"
                                ),
                                "steps": plan_steps,
                            },
                        )

                    for step_index, call in enumerate(tool_calls, start=1):
                        call_id = call.get("id") or ""
                        function = call.get("function") or {}
                        fn_name = function.get("name") or ""
                        raw_args = function.get("arguments") or "{}"
                        try:
                            args = json.loads(raw_args) if raw_args else {}
                        except (json.JSONDecodeError, TypeError):
                            args = {}
                        if not isinstance(args, dict):
                            args = {}

                        if fn_name == LOAD_SKILL_TOOL_NAME:
                            yield ChatStreamEvent(
                                event="agent.phase",
                                data={"phase": "planning"},
                            )
                            yield ChatStreamEvent(
                                event="tool.start",
                                data={
                                    "call_id": call_id,
                                    "tool": LOAD_SKILL_TOOL_NAME,
                                    "args_summary": args,
                                    "effect": "read",
                                },
                            )
                            result, skill_id = self._load_skill(args, entitled_skill_ids)
                            if skill_id and skill_id not in loaded_skill_ids:
                                loaded_skill_ids.append(skill_id)
                            yield ChatStreamEvent(
                                event="agent.skills",
                                data={
                                    "skills": (
                                        [{"id": skill_id, "label": _skill_label(skill_id)}]
                                        if skill_id
                                        else []
                                    ),
                                    "active": list(loaded_skill_ids),
                                },
                            )
                            yield ChatStreamEvent(
                                event="tool.result" if skill_id else "tool.error",
                                data={
                                    "call_id": call_id,
                                    "tool": LOAD_SKILL_TOOL_NAME,
                                    "ok": bool(skill_id),
                                    "summary": (
                                        f"Guía cargada: {_skill_label(skill_id)}"
                                        if skill_id
                                        else "Skill no disponible"
                                    ),
                                },
                            )
                            if plan_steps:
                                plan_steps = mark_plan_step_done(plan_steps, step_index)
                                yield ChatStreamEvent(
                                    event="agent.plan_update",
                                    data={
                                        "decision": "continue",
                                        "steps": plan_steps,
                                    },
                                )
                            messages.append(
                                ChatCompletionMessage(
                                    role="tool",
                                    tool_call_id=call_id,
                                    content=result,
                                )
                            )
                            continue

                        skill_id, tool_name = parse_function_name(fn_name)
                        tool_def = (
                            tool_index.get((skill_id, tool_name)) if skill_id else None
                        )
                        if tool_def is None:
                            messages.append(
                                ChatCompletionMessage(
                                    role="tool",
                                    tool_call_id=call_id,
                                    content=json.dumps(
                                        {
                                            "ok": False,
                                            "summary": (
                                                "Tool is not available. Use only the "
                                                "provided tools."
                                            ),
                                        }
                                    ),
                                )
                            )
                            yield ChatStreamEvent(
                                event="tool.error",
                                data={
                                    "call_id": call_id,
                                    "tool": fn_name,
                                    "ok": False,
                                    "summary": "not_available",
                                },
                            )
                            if plan_steps:
                                plan_steps = mark_plan_step_done(plan_steps, step_index)
                                yield ChatStreamEvent(
                                    event="agent.plan_update",
                                    data={
                                        "decision": "continue",
                                        "steps": plan_steps,
                                    },
                                )
                            continue

                        if tool_iterations >= max_tool_iterations:
                            yield ChatStreamEvent(
                                event="error",
                                data={
                                    "code": "tool_iteration_limit",
                                    "message": (
                                        "Se alcanzó el límite de herramientas para este turno."
                                    ),
                                },
                            )
                            return
                        tool_iterations += 1

                        phase = phase_for_effect(tool_def.effect)
                        yield ChatStreamEvent(event="agent.phase", data={"phase": phase})
                        yield ChatStreamEvent(
                            event="tool.start",
                            data={
                                "call_id": call_id,
                                "tool": tool_name,
                                "skill_id": skill_id,
                                "args_summary": args,
                                "effect": tool_def.effect,
                            },
                        )
                        result = self._registry.execute(
                            skill_id or "", tool_name, args, ctx
                        )
                        yield ChatStreamEvent(
                            event="tool.result" if result.ok else "tool.error",
                            data={
                                "call_id": call_id,
                                "tool": tool_name,
                                "ok": result.ok,
                                "summary": result.summary,
                            },
                        )
                        if plan_steps:
                            plan_steps = mark_plan_step_done(plan_steps, step_index)
                            decision = (
                                "finish"
                                if step_index == len(tool_calls)
                                else "continue"
                            )
                            yield ChatStreamEvent(
                                event="agent.plan_update",
                                data={
                                    "decision": decision,
                                    "steps": plan_steps,
                                },
                            )
                        messages.append(
                            ChatCompletionMessage(
                                role="tool",
                                tool_call_id=call_id,
                                content=json.dumps(
                                    result.model_dump(mode="json"), ensure_ascii=False
                                ),
                            )
                        )
            finally:
                agent_run.end(
                    outputs={
                        "content": "".join(content_parts),
                        "tool_calls": tool_iterations,
                        "llm_turns": total_turns,
                        "loaded_skills": loaded_skill_ids,
                    }
                )

    def _load_skill(
        self, args: dict[str, Any], entitled_skill_ids: list[str]
    ) -> tuple[str, str | None]:
        """Return ``(tool_result_json, skill_id)`` for a ``load_skill`` call."""
        skill_id = args.get("skill_id")
        if not isinstance(skill_id, str) or skill_id not in entitled_skill_ids:
            available = ", ".join(entitled_skill_ids) or "none"
            return (
                json.dumps(
                    {
                        "ok": False,
                        "summary": f"Unknown skill. Available skills: {available}.",
                    }
                ),
                None,
            )
        sections = self._registry.system_prompt_sections([skill_id])
        guide = "\n\n".join(sections).strip() or f"No additional guide for {skill_id}."
        return (
            json.dumps({"ok": True, "summary": "Skill guide loaded.", "guide": guide}),
            skill_id,
        )

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
