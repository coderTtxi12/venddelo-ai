from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.modules.assistant.agent import tracing as tracing_module
from app.modules.assistant.agent.tracing import (
    assistant_tracing_active,
    ensure_assistant_agent_tracing,
)


def test_ensure_assistant_agent_tracing_skips_when_disabled():
    settings = Settings(langsmith_tracing=False, langsmith_api_key="ls-test")
    assert ensure_assistant_agent_tracing(settings) is False


def test_ensure_assistant_agent_tracing_registers_processor(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    tracing_module._assistant_tracing_configured = False

    settings = Settings(
        langsmith_tracing=True,
        langsmith_api_key="ls-test",
        langsmith_project="venddelo-ai",
    )
    processor = MagicMock()

    with (
        patch(
            "langsmith.integrations.openai_agents_sdk.OpenAIAgentsTracingProcessor",
            return_value=processor,
        ),
        patch("langsmith.Client"),
        patch("agents.set_trace_processors") as set_processors,
    ):
        assert ensure_assistant_agent_tracing(settings) is True
        set_processors.assert_called_once_with([processor])

    assert ensure_assistant_agent_tracing(settings) is True
    assert set_processors.call_count == 1


def test_assistant_tracing_active_requires_env_flag(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    tracing_module._assistant_tracing_configured = False

    settings = Settings(langsmith_tracing=True, langsmith_api_key="ls-test")
    with patch.object(tracing_module, "ensure_assistant_agent_tracing", return_value=True):
        assert assistant_tracing_active(settings) is False

    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    from app.infra.llm.tracing import clear_langsmith_env_cache

    clear_langsmith_env_cache()
    with patch.object(tracing_module, "ensure_assistant_agent_tracing", return_value=True):
        assert assistant_tracing_active(settings) is True
