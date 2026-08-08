"""LangSmith tracing for the Facebook marketing browser agent (OpenAI Agents SDK)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.infra.llm.tracing import configure_langsmith_env

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)

_marketing_tracing_configured = False


def ensure_marketing_agent_tracing(settings: Settings) -> bool:
    """Ensure OpenAI Agents SDK spans export to LangSmith for marketing runs.

    Reuses the assistant Agents processor when already registered (same process).
    Otherwise registers a marketing-tagged ``OpenAIAgentsTracingProcessor``.
    Individual runs should still wrap ``Runner.run`` with
    ``trace("facebook_feed_publish", ...)`` for workflow naming.
    """
    global _marketing_tracing_configured

    configure_langsmith_env(settings)
    if not settings.langsmith_tracing or not settings.langsmith_api_key:
        return False

    # Prefer existing assistant processor so we do not replace it mid-process.
    try:
        from app.modules.assistant.agent.tracing import ensure_assistant_agent_tracing

        if ensure_assistant_agent_tracing(settings):
            _marketing_tracing_configured = True
            return True
    except Exception:
        logger.debug("assistant tracing bootstrap unavailable", exc_info=True)

    if _marketing_tracing_configured:
        return True

    try:
        from agents import set_trace_processors
        from langsmith import Client
        from langsmith.integrations.openai_agents_sdk import OpenAIAgentsTracingProcessor
    except ImportError:
        logger.warning(
            "LangSmith OpenAI Agents integration unavailable; "
            "install langsmith[openai-agents]"
        )
        return False

    client = Client(api_key=settings.langsmith_api_key, api_url=settings.langsmith_endpoint)
    processor = OpenAIAgentsTracingProcessor(
        client=client,
        project_name=settings.langsmith_project,
        name="marketing_facebook_browser",
        tags=["marketing", "facebook", "openai-agents", "browser-agent"],
        metadata={"component": "marketing_facebook_browser_agent"},
    )
    set_trace_processors([processor])
    _marketing_tracing_configured = True
    logger.info(
        "OpenAI Agents SDK marketing tracing enabled via LangSmith (project=%s)",
        settings.langsmith_project,
    )
    return True
