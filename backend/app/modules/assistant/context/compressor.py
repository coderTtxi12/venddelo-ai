from __future__ import annotations

import logging

from pydantic import BaseModel

from app.core.config import Settings
from app.modules.assistant.schemas import AssistantChatHistoryMessage

logger = logging.getLogger(__name__)

APPROX_CHARS_PER_TOKEN = 4
MAX_SNAPSHOT_CHARS = 7800

COMPRESSION_SYSTEM_PROMPT = """\
You are a conversation history compressor for a restaurant assistant (business owners).

You will receive older messages from a conversation between the owner and the assistant.

Produce ONE concise summary in Spanish that preserves:
- Concrete facts (products, categories, prices, quantities)
- Files or menus mentioned or attached
- Owner preferences and decisions
- Unresolved or pending questions
- Answers to menu clarification questionnaires
- Explicit owner instructions about the menu

Do not invent information. Do not include greetings or filler.
Write only the summary in prose, with no markdown or JSON.\
"""


class CompressionResult(BaseModel):
    history: list[AssistantChatHistoryMessage]
    compressed: bool
    tokens_before: int
    tokens_after: int
    compressed_message_count: int = 0
    used_llm: bool = False


def estimate_text_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // APPROX_CHARS_PER_TOKEN)


def estimate_history_tokens(history: list[AssistantChatHistoryMessage]) -> int:
    return sum(estimate_text_tokens(item.content) for item in history)


def _format_messages_for_summary(messages: list[AssistantChatHistoryMessage]) -> str:
    lines: list[str] = []
    for item in messages:
        speaker = "Usuario" if item.role == "user" else "Asistente"
        lines.append(f"{speaker}: {item.content}")
    return "\n\n".join(lines)


def _snapshot_message(history: list[AssistantChatHistoryMessage]) -> AssistantChatHistoryMessage:
    lines = [
        "<state_snapshot>",
        "<summary>",
        "Earlier conversation was compressed deterministically. Preserve concrete facts, "
        "menu references, owner preferences, and unresolved questions from these excerpts.",
        "</summary>",
        "<messages>",
    ]
    excerpt_limit = max(80, min(240, MAX_SNAPSHOT_CHARS // max(1, len(history))))
    for item in history:
        role = "owner" if item.role == "user" else "assistant"
        excerpt = " ".join(item.content.split())
        if len(excerpt) > excerpt_limit:
            excerpt = excerpt[: excerpt_limit - 3] + "..."
        lines.append(f'<message role="{role}">{excerpt}</message>')
    lines.extend(["</messages>", "</state_snapshot>"])
    snapshot = "\n".join(lines)
    if len(snapshot) > MAX_SNAPSHOT_CHARS:
        closing_tag = "\n</state_snapshot>"
        snapshot = snapshot[: MAX_SNAPSHOT_CHARS - len(closing_tag)] + closing_tag
    return AssistantChatHistoryMessage(role="assistant", content=snapshot)


def _summary_message(summary: str) -> AssistantChatHistoryMessage:
    cleaned = summary.strip()
    if not cleaned:
        return AssistantChatHistoryMessage(role="assistant", content="<conversation_summary/>")
    return AssistantChatHistoryMessage(
        role="assistant",
        content=f"<conversation_summary>\n{cleaned}\n</conversation_summary>",
    )


async def _summarize_messages_with_llm(
    messages: list[AssistantChatHistoryMessage],
    *,
    settings: Settings,
) -> str | None:
    if not settings.openai_api_key:
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.warning("openai package unavailable; falling back to deterministic compression")
        return None

    model = settings.assistant_context_compression_model or settings.openai_model
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    create_kwargs: dict[str, object] = {
        "model": model,
        "messages": [
            {"role": "system", "content": COMPRESSION_SYSTEM_PROMPT},
            {"role": "user", "content": _format_messages_for_summary(messages)},
        ],
        "max_tokens": settings.assistant_context_compression_max_output_tokens,
    }

    try:
        response = await client.chat.completions.create(**create_kwargs)
    except Exception:
        logger.exception("LLM history compression failed model=%s", model)
        return None

    choice = response.choices[0] if response.choices else None
    if choice is None:
        return None
    content = getattr(choice.message, "content", None)
    if not content or not str(content).strip():
        return None
    return str(content).strip()


async def _compressible_summary_message(
    compressible: list[AssistantChatHistoryMessage],
    *,
    settings: Settings,
) -> tuple[AssistantChatHistoryMessage, bool]:
    summary = await _summarize_messages_with_llm(compressible, settings=settings)
    if summary:
        return _summary_message(summary), True
    return _snapshot_message(compressible), False


async def compress_history_for_llm(
    history: list[AssistantChatHistoryMessage],
    *,
    settings: Settings,
    system_prompt: str,
    user_message: str,
    max_context_tokens: int | None = None,
    threshold_ratio: float | None = None,
    recent_window_turns: int | None = None,
) -> CompressionResult:
    resolved_max_context = (
        max_context_tokens
        if max_context_tokens is not None
        else settings.assistant_context_max_tokens
    )
    resolved_threshold_ratio = (
        threshold_ratio
        if threshold_ratio is not None
        else settings.assistant_context_compression_threshold_ratio
    )
    resolved_recent_window = (
        recent_window_turns
        if recent_window_turns is not None
        else settings.assistant_context_recent_window_turns
    )

    tokens_before = (
        estimate_text_tokens(system_prompt)
        + estimate_text_tokens(user_message)
        + estimate_history_tokens(history)
    )
    threshold = resolved_max_context * resolved_threshold_ratio
    if tokens_before < threshold:
        return CompressionResult(
            history=history,
            compressed=False,
            tokens_before=tokens_before,
            tokens_after=tokens_before,
        )

    recent_count = max(0, resolved_recent_window * 2)
    recent = history[-recent_count:] if recent_count else []
    compressible = history[: len(history) - len(recent)]
    if not compressible:
        return CompressionResult(
            history=history,
            compressed=False,
            tokens_before=tokens_before,
            tokens_after=tokens_before,
        )

    summary_message, used_llm = await _compressible_summary_message(
        compressible,
        settings=settings,
    )
    compressed_history = [summary_message, *recent]
    tokens_after = (
        estimate_text_tokens(system_prompt)
        + estimate_text_tokens(user_message)
        + estimate_history_tokens(compressed_history)
    )
    return CompressionResult(
        history=compressed_history,
        compressed=True,
        tokens_before=tokens_before,
        tokens_after=tokens_after,
        compressed_message_count=len(compressible),
        used_llm=used_llm,
    )
