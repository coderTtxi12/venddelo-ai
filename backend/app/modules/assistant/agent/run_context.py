from __future__ import annotations

from dataclasses import dataclass

from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.registry import SkillRegistry


@dataclass(frozen=True, slots=True)
class AssistantRunContext:
    """Dependency bag passed to OpenAI Agents SDK tool handlers."""

    agent_ctx: AgentContext
    registry: SkillRegistry
