"""LangSmith tracing for the OpenAI Agents SDK assistant orchestrator.

Uses LangSmith's ``OpenAIAgentsTracingProcessor`` to export agent spans (LLM calls,
tool invocations, handoffs) to LangSmith. See:
https://docs.langchain.com/langsmith/trace-with-openai-agents-sdk
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.infra.llm.tracing import configure_langsmith_env, is_langsmith_tracing_enabled

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)

_assistant_tracing_configured = False


def ensure_assistant_agent_tracing(settings: Settings) -> bool:
    """Register LangSmith as the OpenAI Agents SDK trace processor (once per process).

    ``set_trace_processors`` replaces the default OpenAI trace exporter, so traces
    go to LangSmith when enabled. Returns True when the processor is active.
    """
    global _assistant_tracing_configured

    configure_langsmith_env(settings)
    if not settings.langsmith_tracing or not settings.langsmith_api_key:
        return False

    if _assistant_tracing_configured:
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
        name="assistant_chat",
        tags=["assistant", "openai-agents"],
        metadata={"component": "assistant_agent"},
    )
    set_trace_processors([processor])
    _assistant_tracing_configured = True
    logger.info(
        "OpenAI Agents SDK tracing enabled via LangSmith (project=%s)",
        settings.langsmith_project,
    )
    return True


def assistant_tracing_active(settings: Settings) -> bool:
    """True when LangSmith env is on and the Agents SDK processor is registered."""
    return ensure_assistant_agent_tracing(settings) and is_langsmith_tracing_enabled()
