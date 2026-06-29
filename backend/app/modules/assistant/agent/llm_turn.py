from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.agent.response_format import (
    AgentLLMResponse,
    extract_partial_answer_content,
    parse_agent_json_response,
    should_suppress_answer_stream,
)


@dataclass
class AgentLLMParseContext:
    known_skill_ids: set[str] | None = None
    known_tool_names: set[str] | None = None


@dataclass
class AgentLLMTurnResult:
    parsed: AgentLLMResponse | None = None
    raw_response: str = ""
    streamed_chars: int = 0
    error: str | None = None


def iter_agent_llm_turn(
    provider: LLMProviderPort,
    request: ChatCompletionRequest,
    result: AgentLLMTurnResult,
    *,
    parse_context: AgentLLMParseContext | None = None,
) -> Iterator[ChatStreamEvent]:
    buffer = ""

    for event in provider.stream_chat(request):
        if event.event == "error":
            result.error = str(event.data.get("message") or "LLM provider error")
            yield event
            return

        if event.event == "content.delta":
            delta = event.data.get("delta")
            if not isinstance(delta, str) or not delta:
                continue
            buffer += delta
            if should_suppress_answer_stream(buffer):
                continue
            preview = extract_partial_answer_content(buffer)
            if preview is None or len(preview) <= result.streamed_chars:
                continue
            chunk = preview[result.streamed_chars :]
            result.streamed_chars = len(preview)
            yield ChatStreamEvent(event="content.delta", data={"delta": chunk})
            continue

        if event.event != "message.complete":
            continue

        provider_content = event.data.get("content")
        result.raw_response = (
            provider_content if isinstance(provider_content, str) and provider_content else buffer
        )
        try:
            context = parse_context or AgentLLMParseContext()
            result.parsed = parse_agent_json_response(
                result.raw_response,
                known_skill_ids=context.known_skill_ids,
                known_tool_names=context.known_tool_names,
            )
        except ValueError:
            result.error = "invalid_llm_json"
            return

        if result.parsed.type != "answer":
            return

        content = result.parsed.content or ""
        if len(content) > result.streamed_chars:
            yield ChatStreamEvent(
                event="content.delta",
                data={"delta": content[result.streamed_chars :]},
            )
            result.streamed_chars = len(content)
        yield ChatStreamEvent(event="message.complete", data={"content": content})
        return

    if result.raw_response:
        return
    result.error = "invalid_llm_json"
