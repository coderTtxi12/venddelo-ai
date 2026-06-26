from app.core.llm.ports import ChatCompletionMessage
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.assistant.prompts import ASSISTANT_SYSTEM_PROMPT
from app.modules.assistant.schemas import AssistantChatHistoryMessage, AssistantChatRequest
from app.modules.assistant.service import AssistantService


def test_build_messages_puts_system_prompt_first():
    service = AssistantService(provider=StubLLMProvider())
    messages = service.build_messages(
        user_message="Hola",
        history=[AssistantChatHistoryMessage(role="assistant", content="Bienvenido")],
    )

    assert messages[0].role == "system"
    assert messages[0].content == ASSISTANT_SYSTEM_PROMPT
    assert messages[-1].role == "user"
    assert messages[-1].content == "Hola"


def test_stream_chat_emits_delta_and_complete():
    service = AssistantService(provider=StubLLMProvider())
    events = list(
        service.stream_chat(
            AssistantChatRequest(message="Quiero agregar un producto"),
            message_id="msg-test-1",
        )
    )

    assert events[0].event == "content.delta"
    assert events[-1].event == "message.complete"
    assert events[-1].data["message_id"] == "msg-test-1"
    assert "Quiero agregar un producto" in events[-1].data["content"]


def test_format_sse():
    from app.core.llm.ports import ChatStreamEvent

    payload = AssistantService.format_sse(
        ChatStreamEvent(event="content.delta", data={"delta": "Hola"}),
    )
    assert payload.startswith("event: content.delta\n")
    assert '"delta": "Hola"' in payload
