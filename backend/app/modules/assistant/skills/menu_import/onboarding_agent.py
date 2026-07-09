"""Menu import agents: executor (tools) + responder (owner-facing reply)."""

from __future__ import annotations

from agents import Agent

from app.core.config import Settings
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tools import build_menu_import_internal_tools
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord
from app.modules.assistant.skills.menu_import.prompts import (
    MENU_IMPORT_EXECUTOR_INSTRUCTIONS,
    MENU_IMPORT_RESPONDER_INSTRUCTIONS,
)
from app.modules.assistant.skills.menu_import.response_schema import MenuImportUserResponse
from app.modules.assistant.skills.registry import SkillRegistry

MENU_IMPORT_EXECUTOR_NAME = "MenuImportExecutor"
MENU_IMPORT_RESPONDER_NAME = "MenuImportResponder"

# Back-compat alias for traces/tests that referenced a single agent name.
MENU_IMPORT_AGENT_NAME = MENU_IMPORT_EXECUTOR_NAME


def build_menu_import_executor_agent(
    *,
    settings: Settings,
    registry: SkillRegistry,
) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name=MENU_IMPORT_EXECUTOR_NAME,
        instructions=MENU_IMPORT_EXECUTOR_INSTRUCTIONS,
        tools=build_menu_import_internal_tools(registry),
        model=settings.openai_model,
        output_type=ExecutionRecord,
    )


def build_menu_import_responder_agent(*, settings: Settings) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name=MENU_IMPORT_RESPONDER_NAME,
        instructions=MENU_IMPORT_RESPONDER_INSTRUCTIONS,
        tools=[],
        model=settings.openai_model,
        output_type=MenuImportUserResponse,
    )


def build_menu_import_agent(
    *,
    settings: Settings,
    registry: SkillRegistry,
) -> Agent[AssistantRunContext]:
    """Deprecated — use build_menu_import_executor_agent + build_menu_import_responder_agent."""
    return build_menu_import_executor_agent(settings=settings, registry=registry)
