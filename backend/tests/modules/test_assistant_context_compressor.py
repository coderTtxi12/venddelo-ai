import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.config import Settings
from app.modules.assistant.context.compressor import (
    compress_history_for_llm,
    estimate_text_tokens,
)
from app.modules.assistant.schemas import AssistantChatHistoryMessage


def _message(role: str, content: str) -> AssistantChatHistoryMessage:
    return AssistantChatHistoryMessage(role=role, content=content)


def _long_history(message_count: int) -> list[AssistantChatHistoryMessage]:
    messages: list[AssistantChatHistoryMessage] = []
    for index in range(message_count):
        role = "user" if index % 2 == 0 else "assistant"
        messages.append(_message(role, f"Mensaje {index} " + ("x" * 400)))
    return messages


def test_compress_history_skips_when_below_threshold():
    history = [_message("user", "hola"), _message("assistant", "qué necesitas")]

    result = asyncio.run(
        compress_history_for_llm(
            history,
            settings=Settings(),
            system_prompt="sys",
            user_message="user",
            max_context_tokens=8000,
            threshold_ratio=0.70,
            recent_window_turns=2,
        )
    )

    assert result.compressed is False
    assert result.history == history
    assert result.used_llm is False


def test_compress_history_keeps_recent_messages_intact():
    history = _long_history(10)
    recent_window_turns = 2
    recent_count = recent_window_turns * 2
    expected_recent = history[-recent_count:]

    async def fake_summarize(messages, *, settings):
        assert messages == history[:-recent_count]
        return "Resumen: el dueño subió un PDF y pidió importar tacos."

    with patch(
        "app.modules.assistant.context.compressor._summarize_messages_with_llm",
        new=AsyncMock(side_effect=fake_summarize),
    ):
        result = asyncio.run(
            compress_history_for_llm(
                history,
                settings=Settings(openai_api_key="test-key"),
                system_prompt="sys",
                user_message="user",
                max_context_tokens=100,
                threshold_ratio=0.10,
                recent_window_turns=recent_window_turns,
            )
        )

    assert result.compressed is True
    assert result.used_llm is True
    assert len(result.history) == 1 + len(expected_recent)
    assert result.history[0].content.startswith("<conversation_summary>")
    assert "Resumen: el dueño subió un PDF" in result.history[0].content
    assert result.history[1:] == expected_recent


def test_compress_history_falls_back_to_snapshot_when_llm_fails():
    history = _long_history(8)

    with patch(
        "app.modules.assistant.context.compressor._summarize_messages_with_llm",
        new=AsyncMock(return_value=None),
    ):
        result = asyncio.run(
            compress_history_for_llm(
                history,
                settings=Settings(openai_api_key="test-key"),
                system_prompt="sys",
                user_message="user",
                max_context_tokens=100,
                threshold_ratio=0.10,
                recent_window_turns=2,
            )
        )

    assert result.compressed is True
    assert result.used_llm is False
    assert result.history[0].content.startswith("<state_snapshot>")


def test_summarize_messages_with_llm_calls_openai():
    history = [_message("user", "Importa mi menú"), _message("assistant", "Sube el PDF")]

    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="El dueño quiere importar su menú."))]

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("openai.AsyncOpenAI", return_value=mock_client):
        from app.modules.assistant.context.compressor import _summarize_messages_with_llm

        summary = asyncio.run(
            _summarize_messages_with_llm(
                history,
                settings=Settings(openai_api_key="test-key"),
            )
        )

    assert summary == "El dueño quiere importar su menú."
    mock_client.chat.completions.create.assert_awaited_once()
    call_kwargs = mock_client.chat.completions.create.await_args.kwargs
    assert call_kwargs["model"] == Settings().openai_model
    assert "Importa mi menú" in call_kwargs["messages"][1]["content"]


def test_estimate_text_tokens_uses_char_heuristic():
    assert estimate_text_tokens("12345678") == 2
