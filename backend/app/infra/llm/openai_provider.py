from __future__ import annotations

from collections.abc import Iterator

from app.core.config import Settings
from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort


class OpenAILLMProvider(LLMProviderPort):
    def __init__(self, settings: Settings) -> None:
        from langsmith.wrappers import wrap_openai
        from openai import OpenAI

        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required for the openai LLM provider")

        self._client = wrap_openai(OpenAI(api_key=settings.openai_api_key))
        self._default_model = settings.openai_model

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        model = request.model or self._default_model
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        create_kwargs: dict[str, object] = {
            "model": model,
            "messages": messages,
            "temperature": request.temperature,
            "stream": True,
        }
        if request.max_tokens is not None:
            create_kwargs["max_tokens"] = request.max_tokens

        try:
            stream = self._client.chat.completions.create(**create_kwargs)
        except Exception as exc:  # noqa: BLE001 - mapped to domain event
            yield ChatStreamEvent(
                event="error",
                data={"code": "llm_provider_error", "message": str(exc)},
            )
            return

        parts: list[str] = []
        for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            delta = choice.delta.content if choice and choice.delta.content else None
            if not delta:
                continue
            parts.append(delta)
            yield ChatStreamEvent(event="content.delta", data={"delta": delta})

        yield ChatStreamEvent(
            event="message.complete",
            data={"content": "".join(parts)},
        )
