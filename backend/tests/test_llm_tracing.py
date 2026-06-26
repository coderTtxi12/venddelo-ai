import os

from app.core.config import Settings
from app.infra.llm.tracing import configure_langsmith_env, is_langsmith_tracing_enabled


def test_configure_langsmith_env_exports_settings(monkeypatch):
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)
    monkeypatch.delenv("LANGSMITH_ENDPOINT", raising=False)

    settings = Settings(
        langsmith_tracing=True,
        langsmith_api_key="ls-test",
        langsmith_project="venddelo-ai",
        langsmith_endpoint="https://api.smith.langchain.com",
    )
    configure_langsmith_env(settings)

    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_API_KEY"] == "ls-test"
    assert os.environ["LANGSMITH_PROJECT"] == "venddelo-ai"
    assert is_langsmith_tracing_enabled() is True


def test_configure_langsmith_env_disables_tracing(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")

    settings = Settings(langsmith_tracing=False)
    configure_langsmith_env(settings)

    assert os.environ["LANGSMITH_TRACING"] == "false"


def test_get_settings_loads_langsmith_from_env(monkeypatch):
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    monkeypatch.setenv("LANGSMITH_API_KEY", "ls-from-env")
    monkeypatch.setenv("LANGSMITH_PROJECT", "venddelo-ai")

    settings = get_settings()
    assert settings.langsmith_tracing is True
    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_API_KEY"] == "ls-from-env"
    assert is_langsmith_tracing_enabled() is True

    get_settings.cache_clear()
