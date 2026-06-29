from __future__ import annotations

from collections.abc import Iterator

from app.core.config import Settings
from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort


def _estimate_tokens(text: str) -> int:
    return max(0, len(text.split()))


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
            "stream_options": {"include_usage": True},
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
        usage_payload: dict[str, int | str] | None = None
        for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage is not None:
                input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
                output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
                total_tokens = int(
                    getattr(usage, "total_tokens", input_tokens + output_tokens) or 0
                )
                usage_payload = {
                    "provider": "openai",
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": total_tokens,
                }
                continue
            choice = chunk.choices[0] if chunk.choices else None
            delta = choice.delta.content if choice and choice.delta.content else None
            if not delta:
                continue
            parts.append(delta)
            yield ChatStreamEvent(event="content.delta", data={"delta": delta})

        if usage_payload is None:
            output = "".join(parts)
            input_tokens = sum(_estimate_tokens(message.content) for message in request.messages)
            output_tokens = _estimate_tokens(output)
            usage_payload = {
                "provider": "openai",
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
            }

        yield ChatStreamEvent(
            event="message.complete",
            data={"content": "".join(parts), "usage": usage_payload},
        )
