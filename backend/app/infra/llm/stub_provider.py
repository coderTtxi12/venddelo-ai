from __future__ import annotations

from collections.abc import Iterator

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort


class StubLLMProvider(LLMProviderPort):
    """Deterministic provider for local dev and tests."""

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        user_messages = [m.content for m in request.messages if m.role == "user"]
        latest = user_messages[-1] if user_messages else ""
        full_text = f"Recibí tu mensaje: {latest}"

        for token in full_text.split(" "):
            yield ChatStreamEvent(event="content.delta", data={"delta": f"{token} "})

        yield ChatStreamEvent(
            event="message.complete",
            data={"content": full_text},
        )
