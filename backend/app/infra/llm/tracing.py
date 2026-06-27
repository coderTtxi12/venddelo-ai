from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)


def configure_langsmith_env(settings: Settings) -> None:
    """Export LangSmith settings to os.environ for the langsmith SDK."""
    os.environ["LANGSMITH_TRACING"] = "true" if settings.langsmith_tracing else "false"

    if settings.langsmith_api_key:
        os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key

    if settings.langsmith_project:
        os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project

    if settings.langsmith_endpoint:
        os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint


def is_langsmith_tracing_enabled() -> bool:
    from langsmith.utils import tracing_is_enabled

    return bool(tracing_is_enabled())


def flush_langsmith_traces() -> None:
    """Flush pending LangSmith runs before process shutdown (official SDK guidance)."""
    if not is_langsmith_tracing_enabled():
        return

    try:
        from langsmith import Client

        Client().flush()
    except Exception:
        logger.exception("Failed to flush LangSmith traces")


def log_tracing_status() -> None:
    if not is_langsmith_tracing_enabled():
        logger.info("LangSmith tracing disabled")
        return

    project = os.getenv("LANGSMITH_PROJECT", "default")
    endpoint = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")
    has_key = bool(os.getenv("LANGSMITH_API_KEY"))
    logger.info(
        "LangSmith tracing enabled (project=%s, endpoint=%s, api_key_set=%s)",
        project,
        endpoint,
        has_key,
    )

    if not has_key:
        logger.warning("LANGSMITH_API_KEY is missing; traces will not be sent")
