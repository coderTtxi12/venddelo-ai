from __future__ import annotations

import json
import uuid
from collections.abc import Iterator

from langsmith import trace

from app.core.config import Settings, get_settings
from app.core.llm.ports import (
    ChatCompletionMessage,
    ChatCompletionRequest,
    ChatStreamEvent,
    LLMProviderPort,
)
from app.modules.assistant.agent.response_format import (
    build_agent_runtime_section,
    parse_agent_response,
)
from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.prompts import ASSISTANT_CORE_POLICY
from app.modules.assistant.schemas import AssistantChatHistoryMessage, AssistantChatRequest


def aggregate_assistant_stream_output(content_parts: list[str]) -> dict[str, object]:
    """Reduce streamed assistant tokens for LangSmith output."""
    content = "".join(content_parts)
    return {
        "content": content,
        "content_length": len(content),
    }


class AssistantService:
    def __init__(self, *, provider: LLMProviderPort, settings: Settings | None = None) -> None:
        self._provider = provider
        self._settings = settings or get_settings()

    def build_messages(
        self,
        *,
        user_message: str,
        history: list[AssistantChatHistoryMessage],
        system_prompt: str | None = None,
    ) -> list[ChatCompletionMessage]:
        messages: list[ChatCompletionMessage] = [
            ChatCompletionMessage(role="system", content=system_prompt or ASSISTANT_CORE_POLICY),
        ]

        for item in history:
            messages.append(
                ChatCompletionMessage(role=item.role, content=item.content),
            )

        messages.append(ChatCompletionMessage(role="user", content=user_message))
        return messages

    def stream_chat(
        self,
        request: AssistantChatRequest,
        *,
        message_id: str | None = None,
        restaurant_id: str | None = None,
        conversation_id: str | None = None,
        system_prompt: str | None = None,
    ) -> Iterator[ChatStreamEvent]:
        resolved_message_id = message_id or str(uuid.uuid4())
        trace_metadata: dict[str, str] = {"message_id": resolved_message_id}
        if restaurant_id:
            trace_metadata["restaurant_id"] = restaurant_id
        if conversation_id:
            trace_metadata["conversation_id"] = conversation_id

        with trace(
            "assistant_chat",
            run_type="chain",
            metadata=trace_metadata,
            exceptions_to_handle=(GeneratorExit,),
        ) as run:
            yield ChatStreamEvent(event="agent.phase", data={"phase": "analyzing"})
            yield ChatStreamEvent(event="agent.status", data={"status": "processing"})

            system = (system_prompt or ASSISTANT_CORE_POLICY) + "\n\n---\n\n" + build_agent_runtime_section()
            compression = compress_history_for_llm(
                request.history,
                system_prompt=system,
                user_message=request.message,
                max_context_tokens=self._settings.assistant_context_max_tokens,
                threshold_ratio=self._settings.assistant_context_compression_threshold_ratio,
                recent_window_turns=self._settings.assistant_context_recent_window_turns,
            )
            history = (
                compression.history
                if self._settings.assistant_context_compression_enabled
                else request.history
            )

            messages = self.build_messages(
                user_message=request.message,
                history=history,
                system_prompt=system,
            )

            completion = ChatCompletionRequest(messages=messages)
            content_parts: list[str] = []

            try:
                for event in self._provider.stream_chat(completion):
                    if event.event == "content.delta":
                        delta = event.data.get("delta")
                        if isinstance(delta, str) and delta:
                            content_parts.append(delta)
                        yield event
                        continue

                    if event.event == "error":
                        yield event
                        return

                    if event.event == "message.complete":
                        provider_content = event.data.get("content")
                        raw_content = (
                            provider_content
                            if isinstance(provider_content, str) and provider_content
                            else "".join(content_parts)
                        )
                        parsed = parse_agent_response(raw_content)
                        final_content = parsed["content"]
                        final_reasoning = parsed["reasoning"]
                        if final_reasoning:
                            yield ChatStreamEvent(
                                event="agent.thought",
                                data={"text": final_reasoning, "replace": False},
                            )
                        if final_content and not content_parts:
                            yield ChatStreamEvent(
                                event="content.delta",
                                data={"delta": final_content},
                            )
                        yield ChatStreamEvent(
                            event="message.complete",
                            data={
                                "message_id": resolved_message_id,
                                "content": final_content,
                                "reasoning": final_reasoning,
                                "usage": event.data.get("usage"),
                                "context_compression": compression.model_dump(mode="json"),
                            },
                        )
                        return
            finally:
                run.end(outputs=aggregate_assistant_stream_output(content_parts))

    @staticmethod
    def format_sse(event: ChatStreamEvent) -> str:
        return f"event: {event.event}\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
