"""Factory helpers for workflow-specific OpenAI Agents SDK agents."""

from __future__ import annotations

from agents import Agent, FunctionTool

from app.core.config import Settings
from app.modules.assistant.agent.model_settings import build_assistant_model_settings
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tools import (
    build_executor_function_tools,
    build_operations_function_tools,
)
from app.modules.assistant.agent.workflow.prompts import (
    CATALOG_AGENT_INSTRUCTIONS,
    OPERATIONS_AGENT_INSTRUCTIONS,
    ORCHESTRATOR_INSTRUCTIONS,
)
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord
from app.modules.assistant.skills.registry import SkillRegistry

ORCHESTRATOR_NAME = "Orchestrator"
CATALOG_AGENT_NAME = "CatalogAgent"
OPERATIONS_AGENT_NAME = "OperationsAgent"


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


def build_catalog_agent(
    *,
    settings: Settings,
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    extra_tools: list[FunctionTool] | None = None,
) -> Agent[AssistantRunContext]:
    tools = build_executor_function_tools(registry, effective_skill_ids, settings=settings)
    if extra_tools:
        tools = [*tools, *extra_tools]
    return Agent[AssistantRunContext](
        name=CATALOG_AGENT_NAME,
        instructions=CATALOG_AGENT_INSTRUCTIONS,
        tools=tools,
        model=settings.openai_model,
        model_settings=build_assistant_model_settings(
            settings,
            parallel_tool_calls=False,
        ),
        output_type=ExecutionRecord,
    )


def build_operations_agent(
    *,
    settings: Settings,
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    extra_tools: list[FunctionTool] | None = None,
) -> Agent[AssistantRunContext]:
    tools = build_operations_function_tools(registry, effective_skill_ids, settings=settings)
    if extra_tools:
        tools = [*tools, *extra_tools]
    return Agent[AssistantRunContext](
        name=OPERATIONS_AGENT_NAME,
        instructions=OPERATIONS_AGENT_INSTRUCTIONS,
        tools=tools,
        model=settings.openai_model,
        model_settings=build_assistant_model_settings(
            settings,
            parallel_tool_calls=False,
        ),
        output_type=ExecutionRecord,
    )


# Back-compat aliases.
build_restaurant_ops_subagent = build_catalog_agent
build_executor_agent = build_catalog_agent
RESTAURANT_OPS_SUBAGENT_NAME = CATALOG_AGENT_NAME
