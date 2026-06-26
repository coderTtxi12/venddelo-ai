from __future__ import annotations

import logging

from app.core.config import Settings, get_settings
from app.core.llm.ports import LLMProviderPort
from app.infra.llm.openai_provider import OpenAILLMProvider
from app.infra.llm.stub_provider import StubLLMProvider

logger = logging.getLogger(__name__)


def build_llm_provider(settings: Settings | None = None) -> LLMProviderPort:
    cfg = settings or get_settings()
    provider = (cfg.llm_provider or "stub").strip().lower()

    if provider == "openai":
        if not cfg.openai_api_key:
            logger.warning("LLM_PROVIDER=openai but OPENAI_API_KEY is missing; using stub provider")
            return StubLLMProvider()
        logger.info("Using OpenAI LLM provider with model %s", cfg.openai_model)
        return OpenAILLMProvider(cfg)

    if provider == "stub":
        logger.info("Using stub LLM provider")
        return StubLLMProvider()

    logger.warning("Unknown LLM_PROVIDER=%s; using stub provider", provider)
    return StubLLMProvider()
