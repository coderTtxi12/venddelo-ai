from __future__ import annotations

import json
import uuid
from collections.abc import Iterator

from langsmith import trace

from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.prompts import ASSISTANT_SYSTEM_PROMPT
from app.modules.assistant.schemas import AssistantChatHistoryMessage, AssistantChatRequest


def aggregate_assistant_stream_output(content_parts: list[str]) -> dict[str, object]:
    """Reduce streamed assistant tokens for LangSmith output (see trace-generator-functions docs)."""
    content = "".join(content_parts)
    return {
        "content": content,
        "content_length": len(content),
    }


class AssistantService:
    def __init__(self, *, provider: LLMProviderPort) -> None:
        self._provider = provider

    def build_messages(
        self,
        *,
        user_message: str,
        history: list[AssistantChatHistoryMessage],
    ) -> list[ChatCompletionMessage]:
        messages: list[ChatCompletionMessage] = [
            ChatCompletionMessage(role="system", content=ASSISTANT_SYSTEM_PROMPT),
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
    ) -> Iterator[ChatStreamEvent]:
        resolved_message_id = message_id or str(uuid.uuid4())
        trace_metadata: dict[str, str] = {"message_id": resolved_message_id}
        if restaurant_id:
            trace_metadata["restaurant_id"] = restaurant_id
        if conversation_id:
            trace_metadata["conversation_id"] = conversation_id

        # Use trace() instead of @traceable on a generator: LangSmith records GeneratorExit
        # as an error when SSE clients disconnect unless it is explicitly ignored.
        with trace(
            "assistant_chat",
            run_type="chain",
            metadata=trace_metadata,
            exceptions_to_handle=(GeneratorExit,),
        ) as run:
            messages = self.build_messages(
                user_message=request.message,
                history=request.history,
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
                        final_content = (
                            provider_content
                            if isinstance(provider_content, str) and provider_content
                            else "".join(content_parts)
                        )
                        yield ChatStreamEvent(
                            event="message.complete",
                            data={
                                "message_id": resolved_message_id,
                                "content": final_content,
                            },
                        )
                        return
            finally:
                run.end(outputs=aggregate_assistant_stream_output(content_parts))

    @staticmethod
    def format_sse(event: ChatStreamEvent) -> str:
        return f"event: {event.event}\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
