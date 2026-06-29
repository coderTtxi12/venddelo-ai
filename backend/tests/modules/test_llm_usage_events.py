from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest
from app.infra.llm.stub_provider import StubLLMProvider


def test_stub_provider_emits_usage_on_message_complete():
    provider = StubLLMProvider()
    events = list(
        provider.stream_chat(
            ChatCompletionRequest(
                messages=[
                    ChatCompletionMessage(role="system", content="You respond in Spanish."),
                    ChatCompletionMessage(role="user", content="Hola"),
                ]
            )
        )
    )

    complete = events[-1]

    assert complete.event == "message.complete"
    assert complete.data["usage"] == {
        "provider": "stub",
        "model": "stub",
        "input_tokens": 5,
        "output_tokens": 4,
        "total_tokens": 9,
    }
