from __future__ import annotations

import json
from collections.abc import Iterator

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.agent.response_format import ASSISTANT_JSON_RESPONSE_MARKER


def _estimate_tokens(text: str) -> int:
    return len(text.split())


class StubLLMProvider(LLMProviderPort):
    """Deterministic provider for local dev and tests."""

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        system_messages = [
            message.content for message in request.messages if message.role == "system"
        ]
        user_messages = [message.content for message in request.messages if message.role == "user"]
        system_prompt = system_messages[-1] if system_messages else ""
        latest_user = user_messages[-1] if user_messages else ""

        if ASSISTANT_JSON_RESPONSE_MARKER in system_prompt:
            full_text = self._agent_json_response(system_prompt, latest_user)
        else:
            full_text = f"Recibí tu mensaje: {latest_user}"

        input_tokens = sum(_estimate_tokens(message.content) for message in request.messages)
        output_tokens = _estimate_tokens(full_text)

        for token in full_text.split(" "):
            yield ChatStreamEvent(event="content.delta", data={"delta": f"{token} "})

        yield ChatStreamEvent(
            event="message.complete",
            data={
                "content": full_text,
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
    def _agent_json_response(system_prompt: str, latest_user: str) -> str:
        if "Tool execution finished." in latest_user or "Tool result JSON:" in latest_user:
            return json.dumps(
                {
                    "type": "answer",
                    "content": "Encontré productos relacionados con tu búsqueda.",
                    "language": "es",
                },
                ensure_ascii=False,
            )

        if (
            "menu_read.search_products" in system_prompt
            and StubLLMProvider._should_use_menu_read_tool(latest_user)
        ):
            return json.dumps(
                {
                    "type": "tool_call",
                    "skill_id": "menu_read",
                    "tool": "search_products",
                    "args": {"query": latest_user.strip() or "pastor"},
                },
                ensure_ascii=False,
            )

        return json.dumps(
            {
                "type": "answer",
                "content": f"Recibí tu mensaje: {latest_user}",
                "language": "es",
            },
            ensure_ascii=False,
        )

    @staticmethod
    def _should_use_menu_read_tool(message: str) -> bool:
        normalized = message.strip().casefold()
        return any(
            token in normalized
            for token in ("busca", "producto", "productos", "categor", "menú", "menu", "pastor")
        )
