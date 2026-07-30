"""Factory helpers for workflow-specific OpenAI Agents SDK agents."""

from __future__ import annotations

from agents import Agent, FunctionTool

from app.core.config import Settings
from app.modules.assistant.agent.model_settings import build_assistant_model_settings
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tools import build_executor_function_tools
from app.modules.assistant.agent.workflow.prompts import (
    ORCHESTRATOR_INSTRUCTIONS,
    RESTAURANT_OPS_SUBAGENT_INSTRUCTIONS,
)
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord
from app.modules.assistant.skills.registry import SkillRegistry

ORCHESTRATOR_NAME = "Orchestrator"
RESTAURANT_OPS_SUBAGENT_NAME = "RestaurantOpsSubagent"


def build_orchestrator_agent(
    *,
    settings: Settings,
    tools: list[FunctionTool],
) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name=ORCHESTRATOR_NAME,
        instructions=ORCHESTRATOR_INSTRUCTIONS,
        tools=tools,
        model=settings.openai_model,
        model_settings=build_assistant_model_settings(settings),
    )


def build_restaurant_ops_subagent(
    *,
    settings: Settings,
    registry: SkillRegistry,
    effective_skill_ids: list[str],
) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name=RESTAURANT_OPS_SUBAGENT_NAME,
        instructions=RESTAURANT_OPS_SUBAGENT_INSTRUCTIONS,
        tools=build_executor_function_tools(registry, effective_skill_ids, settings=settings),
        model=settings.openai_model,
        model_settings=build_assistant_model_settings(
            settings,
            parallel_tool_calls=False,
        ),
        output_type=ExecutionRecord,
    )


# Back-compat alias.
build_executor_agent = build_restaurant_ops_subagent
