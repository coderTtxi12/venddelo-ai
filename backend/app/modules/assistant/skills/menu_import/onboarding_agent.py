"""Menu import subagent (tools only; Orchestrator writes the owner-facing reply)."""

from __future__ import annotations

from agents import Agent

from app.core.config import Settings
from app.modules.assistant.agent.model_settings import build_assistant_model_settings
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tools import build_menu_import_internal_tools
from app.modules.assistant.agent.workflow.prompts import MENU_SUBAGENT_INSTRUCTIONS
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord
from app.modules.assistant.skills.registry import SkillRegistry

MENU_SUBAGENT_NAME = "MenuSubagent"

# Back-compat aliases for traces/tests.
MENU_IMPORT_EXECUTOR_NAME = MENU_SUBAGENT_NAME
MENU_IMPORT_AGENT_NAME = MENU_SUBAGENT_NAME


def build_menu_subagent(
    *,
    settings: Settings,
    registry: SkillRegistry,
) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name=MENU_SUBAGENT_NAME,
        instructions=MENU_SUBAGENT_INSTRUCTIONS,
        tools=build_menu_import_internal_tools(registry),
        model=settings.openai_model,
        model_settings=build_assistant_model_settings(
            settings,
            parallel_tool_calls=False,
        ),
        output_type=ExecutionRecord,
    )


build_menu_import_executor_agent = build_menu_subagent
build_menu_import_agent = build_menu_subagent
