from app.core.config import Settings
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.assistant.schemas import AssistantChatHistoryMessage, AssistantChatRequest
from app.modules.assistant.service import AssistantService


def test_assistant_service_compresses_large_history_before_llm_call():
    history = []
    for idx in range(20):
        history.append(
            AssistantChatHistoryMessage(
                role="user",
                content=f"Pregunta antigua {idx} " * 30,
            )
        )
        history.append(
            AssistantChatHistoryMessage(
                role="assistant",
                content=f"Respuesta antigua {idx} " * 30,
            )
        )
    service = AssistantService(
        provider=StubLLMProvider(),
        settings=Settings(
            assistant_context_max_tokens=500,
            assistant_context_compression_threshold_ratio=0.70,
            assistant_context_recent_window_turns=3,
        ),
    )

    events = list(service.stream_chat(AssistantChatRequest(message="Hola", history=history)))
    complete = events[-1]

    assert complete.event == "message.complete"
    compression = complete.data["context_compression"]
    assert compression["compressed"] is True
    assert compression["compressed_message_count"] == 34
    assert compression["tokens_after"] < compression["tokens_before"]
