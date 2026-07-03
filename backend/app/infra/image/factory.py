from __future__ import annotations

import logging

from app.core.config import Settings, get_settings
from app.core.image.ports import ImageGenerationPort
from app.infra.image.openai_provider import OpenAIImageProvider
from app.infra.image.stub_provider import StubImageProvider

logger = logging.getLogger(__name__)


def build_image_provider(settings: Settings | None = None) -> ImageGenerationPort:
    cfg = settings or get_settings()
    provider = (cfg.image_provider or "stub").strip().lower()

    if provider == "openai":
        if not cfg.openai_api_key:
            logger.warning(
                "IMAGE_PROVIDER=openai but OPENAI_API_KEY is missing; using stub image provider"
            )
            return StubImageProvider()
        logger.info("Using OpenAI image provider with model %s", cfg.openai_image_model)
        return OpenAIImageProvider(cfg)

    if provider == "stub":
        logger.info("Using stub image provider")
        return StubImageProvider()

    logger.warning("Unknown IMAGE_PROVIDER=%s; using stub image provider", provider)
    return StubImageProvider()
