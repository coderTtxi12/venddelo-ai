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
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.agent.response_format import (
    AgentLLMResponse,
    build_tools_prompt_section,
    parse_agent_json_response,
)
from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.skills.base import ToolDefinition, ToolResult


class AgentSkillRegistry(Protocol):
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


def _collect_completion(provider: LLMProviderPort, request: ChatCompletionRequest) -> str:
    content_parts: list[str] = []
    for event in provider.stream_chat(request):
        if event.event == "content.delta":
            delta = event.data.get("delta")
            if isinstance(delta, str) and delta:
                content_parts.append(delta)
            continue
        if event.event == "error":
            message = event.data.get("message")
            raise RuntimeError(message if isinstance(message, str) else "LLM provider error")
        if event.event == "message.complete":
            provider_content = event.data.get("content")
            if isinstance(provider_content, str) and provider_content:
                return provider_content
            return "".join(content_parts)
    return "".join(content_parts)


def _stream_answer_content(content: str) -> Iterator[ChatStreamEvent]:
    for token in content.split(" "):
        yield ChatStreamEvent(event="content.delta", data={"delta": f"{token} "})
    yield ChatStreamEvent(event="message.complete", data={"content": content})


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
        entitled_tools = self._registry.entitled_tools(ctx.effective_skill_ids)
        system_prompt = self._compose_agent_system_prompt(
            profile,
            effective_skill_ids=ctx.effective_skill_ids,
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

        while True:
            raw_response = _collect_completion(
                self._provider,
                ChatCompletionRequest(messages=messages),
            )
            try:
                parsed = parse_agent_json_response(raw_response)
            except ValueError:
                yield ChatStreamEvent(
                    event="error",
                    data={
                        "code": "invalid_llm_json",
                        "message": "El asistente devolvió un formato JSON inválido.",
                    },
                )
                return

            if parsed.type == "answer":
                yield from _stream_answer_content(parsed.content or "")
                return

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
            messages.append(
                ChatCompletionMessage(
                    role="user",
                    content=(
                        "Tool execution finished. Use the result below and respond with JSON "
                        'type "answer". Do not invent data.\n\n'
                        f"Original owner message: {request.message}\n\n"
                        "Tool result JSON: "
                        f"{json.dumps(result.model_dump(mode='json'), ensure_ascii=False)}"
                    ),
                )
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
        system_prompt = system_prompt + "\n\n---\n\n" + build_tools_prompt_section(entitled_tools)
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
