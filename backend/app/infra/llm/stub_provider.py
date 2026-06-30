from __future__ import annotations

import json
from collections.abc import Iterator

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort


def _estimate_tokens(text: str) -> int:
    return len(text.split())


class StubLLMProvider(LLMProviderPort):
    """Deterministic provider for local dev and tests (native tool calling)."""

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        user_messages = [
            m.content or "" for m in request.messages if m.role == "user"
        ]
        latest_user = user_messages[-1] if user_messages else ""
        last_role = request.messages[-1].role if request.messages else "user"

        tool_calls = None
        content = f"Recibí tu mensaje: {latest_user}"

        if request.tools and last_role != "tool":
            search_fn = self._find_search_tool(request.tools)
            if search_fn and self._should_search(latest_user):
                tool_calls = [
                    {
                        "id": "call_stub_1",
                        "type": "function",
                        "function": {
                            "name": search_fn,
                            "arguments": json.dumps(
                                {"query": latest_user.strip() or "pastor"},
                                ensure_ascii=False,
                            ),
                        },
                    }
                ]
                content = ""
        elif last_role == "tool":
            content = "Encontré productos relacionados con tu búsqueda."

        input_tokens = sum(_estimate_tokens(m.content or "") for m in request.messages)
        output_tokens = _estimate_tokens(content)

        if content and tool_calls is None:
            for token in content.split(" "):
                yield ChatStreamEvent(event="content.delta", data={"delta": f"{token} "})

        yield ChatStreamEvent(
            event="message.complete",
            data={
                "content": content,
                "tool_calls": tool_calls,
                "usage": {
                    "provider": "stub",
                    "model": request.model or "stub",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                },
            },
        )

    @staticmethod
    def _find_search_tool(tools: list[dict]) -> str | None:
        for tool in tools:
            name = (tool.get("function") or {}).get("name") or ""
            if name.endswith("search_products"):
                return name
        return None

    @staticmethod
    def _should_search(message: str) -> bool:
        normalized = message.strip().casefold()
        return any(
            token in normalized
            for token in ("busca", "producto", "productos", "categor", "menú", "menu", "pastor")
        )
