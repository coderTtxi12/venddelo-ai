from app.core.config import Settings
from app.infra.llm.factory import build_llm_provider
from app.infra.llm.openai_provider import OpenAILLMProvider
from app.infra.llm.stub_provider import StubLLMProvider


def test_build_llm_provider_defaults_to_stub():
    settings = Settings(llm_provider="stub", openai_api_key=None)
    provider = build_llm_provider(settings)
    assert isinstance(provider, StubLLMProvider)


def test_build_llm_provider_openai_without_key_falls_back_to_stub():
    settings = Settings(llm_provider="openai", openai_api_key=None)
    provider = build_llm_provider(settings)
    assert isinstance(provider, StubLLMProvider)


def test_build_llm_provider_openai_with_key():
    settings = Settings(llm_provider="openai", openai_api_key="sk-test")
    provider = build_llm_provider(settings)
    assert isinstance(provider, OpenAILLMProvider)
