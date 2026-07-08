"""Factory helpers for workflow-specific OpenAI Agents SDK agents."""

from __future__ import annotations

from agents import Agent

from app.core.config import Settings
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tools import build_executor_function_tools
from app.modules.assistant.agent.workflow.prompts import (
    EVALUATOR_INSTRUCTIONS,
    EXECUTOR_INSTRUCTIONS,
    PLANNER_INSTRUCTIONS,
    REPLANNER_INSTRUCTIONS,
    RESPONDER_INSTRUCTIONS,
)
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    WorkflowEvaluation,
    WorkflowPlan,
)
from app.modules.assistant.skills.registry import SkillRegistry


def build_planner_agent(*, settings: Settings) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name="Planner",
        instructions=PLANNER_INSTRUCTIONS,
        tools=[],
        model=settings.openai_model,
        output_type=WorkflowPlan,
    )


def build_executor_agent(
    *,
    settings: Settings,
    registry: SkillRegistry,
    effective_skill_ids: list[str],
) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name="Executor",
        instructions=EXECUTOR_INSTRUCTIONS,
        tools=build_executor_function_tools(registry, effective_skill_ids, settings=settings),
        model=settings.openai_model,
        output_type=ExecutionRecord,
    )


def build_evaluator_agent(*, settings: Settings) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name="Evaluator",
        instructions=EVALUATOR_INSTRUCTIONS,
        tools=[],
        model=settings.openai_model,
        output_type=WorkflowEvaluation,
    )


def build_replanner_agent(*, settings: Settings) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name="Replanner",
        instructions=REPLANNER_INSTRUCTIONS,
        tools=[],
        model=settings.openai_model,
        output_type=WorkflowPlan,
    )


def build_responder_agent(*, settings: Settings) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name="Responder",
        instructions=RESPONDER_INSTRUCTIONS,
        tools=[],
        model=settings.openai_model,
    )
