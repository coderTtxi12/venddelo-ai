from __future__ import annotations

import json
import uuid
from collections.abc import Iterator

from langsmith import traceable
from langsmith.run_helpers import get_current_run_tree

from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.prompts import ASSISTANT_SYSTEM_PROMPT
from app.modules.assistant.schemas import AssistantChatHistoryMessage, AssistantChatRequest


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

    @traceable(name="assistant_chat", run_type="chain")
    def stream_chat(
        self,
        request: AssistantChatRequest,
        *,
        message_id: str | None = None,
        restaurant_id: str | None = None,
    ) -> Iterator[ChatStreamEvent]:
        run = get_current_run_tree()
        resolved_message_id = message_id or str(uuid.uuid4())
        if run is not None:
            if restaurant_id:
                run.metadata["restaurant_id"] = restaurant_id
            run.metadata["message_id"] = resolved_message_id

        messages = self.build_messages(
            user_message=request.message,
            history=request.history,
        )

        completion = ChatCompletionRequest(messages=messages)
        content_parts: list[str] = []

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

    @staticmethod
    def format_sse(event: ChatStreamEvent) -> str:
        return f"event: {event.event}\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
