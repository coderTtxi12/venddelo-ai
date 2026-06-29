from __future__ import annotations

from pydantic import BaseModel

from app.modules.assistant.schemas import AssistantChatHistoryMessage

APPROX_CHARS_PER_TOKEN = 4
MAX_SNAPSHOT_CHARS = 7800


class CompressionResult(BaseModel):
    history: list[AssistantChatHistoryMessage]
    compressed: bool
    tokens_before: int
    tokens_after: int
    compressed_message_count: int = 0


def estimate_text_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // APPROX_CHARS_PER_TOKEN)


def estimate_history_tokens(history: list[AssistantChatHistoryMessage]) -> int:
    return sum(estimate_text_tokens(item.content) for item in history)


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


def compress_history_for_llm(
    history: list[AssistantChatHistoryMessage],
    *,
    system_prompt: str,
    user_message: str,
    max_context_tokens: int,
    threshold_ratio: float,
    recent_window_turns: int,
) -> CompressionResult:
    tokens_before = (
        estimate_text_tokens(system_prompt)
        + estimate_text_tokens(user_message)
        + estimate_history_tokens(history)
    )
    threshold = max_context_tokens * threshold_ratio
    if tokens_before < threshold:
        return CompressionResult(
            history=history,
            compressed=False,
            tokens_before=tokens_before,
            tokens_after=tokens_before,
        )

    recent_count = max(0, recent_window_turns * 2)
    recent = history[-recent_count:] if recent_count else []
    compressible = history[: len(history) - len(recent)]
    if not compressible:
        return CompressionResult(
            history=history,
            compressed=False,
            tokens_before=tokens_before,
            tokens_after=tokens_before,
        )

    compressed_history = [_snapshot_message(compressible), *recent]
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
    )
