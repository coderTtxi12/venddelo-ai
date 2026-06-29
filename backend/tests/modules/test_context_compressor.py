from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.schemas import AssistantChatHistoryMessage


def _msg(role: str, content: str) -> AssistantChatHistoryMessage:
    return AssistantChatHistoryMessage(role=role, content=content)


def test_short_history_is_not_compressed():
    history = [
        _msg("user", "Hola"),
        _msg("assistant", "Hola, ¿cómo te ayudo?"),
    ]

    result = compress_history_for_llm(
        history,
        system_prompt="system",
        user_message="Lista mis tacos",
        max_context_tokens=4000,
        threshold_ratio=0.70,
        recent_window_turns=6,
    )

    assert result.compressed is False
    assert result.history == history


def test_long_history_becomes_state_snapshot_plus_recent_window():
    history = []
    for idx in range(20):
        history.append(_msg("user", f"Pregunta antigua {idx} sobre el menú " * 20))
        history.append(_msg("assistant", f"Respuesta antigua {idx} con detalles " * 20))

    result = compress_history_for_llm(
        history,
        system_prompt="system " * 100,
        user_message="¿Qué productos tengo?",
        max_context_tokens=500,
        threshold_ratio=0.70,
        recent_window_turns=3,
    )

    assert result.compressed is True
    assert result.tokens_after < result.tokens_before
    assert result.compressed_message_count == 34
    assert result.history[0].role == "assistant"
    assert "<state_snapshot>" in result.history[0].content
    assert "Pregunta antigua 0" in result.history[0].content
    assert result.history[1:] == history[-6:]
