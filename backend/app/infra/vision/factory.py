from __future__ import annotations

import logging

from app.core.config import Settings, get_settings
from app.core.vision.ports import VisionPort
from app.infra.vision.openai_provider import OpenAIVisionProvider
from app.infra.vision.stub_provider import StubVisionProvider

logger = logging.getLogger(__name__)


def build_vision_provider(settings: Settings | None = None) -> VisionPort:
    cfg = settings or get_settings()
    provider = (cfg.vision_provider or "openai").strip().lower()

    if provider == "openai":
        if not cfg.openai_api_key:
            logger.warning(
                "VISION_PROVIDER=openai but OPENAI_API_KEY is missing; using stub vision provider"
            )
            return StubVisionProvider()
        logger.info("Using OpenAI vision provider with model %s", cfg.openai_vision_model)
        return OpenAIVisionProvider(cfg)

    if provider == "stub":
        logger.info("Using stub vision provider")
        return StubVisionProvider()

    logger.warning("Unknown VISION_PROVIDER=%s; using stub vision provider", provider)
    return StubVisionProvider()
