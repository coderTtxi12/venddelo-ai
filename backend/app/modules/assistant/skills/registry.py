"""Skill registry for the agent runtime.

Collects ``SkillPort`` implementations (e.g. ``menu_read``), indexes them by
``skill.id``, and exposes entitled tools and prompt sections filtered by
``effective_skill_ids`` from profile + entitlements resolution.

Delete-effect tools are rejected at construction time. ``execute`` re-checks
entitlements against ``AgentContext`` before delegating to the skill.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult


class SkillRegistry:
    """Lookup table of registered skills and their tools for one process lifetime."""

    def __init__(self, skills: Iterable[SkillPort]) -> None:
        """Register skills by ``id``; fail fast if any tool has delete effect."""
        self._skills = {skill.id: skill for skill in skills}
        for skill in self._skills.values():
            for tool in skill.tool_definitions():
                if tool.effect == "delete" or tool.name.lower().startswith("delete_"):
                    raise ValueError(f"delete tools are not allowed: {tool.name}")

    def registered_skill_ids(self) -> list[str]:
        """Skill IDs wired in code for this process (may exceed tenant entitlements)."""
        return sorted(self._skills.keys())

    def tool_definitions(self, effective_skill_ids: list[str]) -> list[ToolDefinition]:
        """Flat list of tool schemas the LLM may call for entitled skills."""
        return [tool for _, tool in self.entitled_tools(effective_skill_ids)]

    def entitled_tools(self, effective_skill_ids: list[str]) -> list[tuple[str, ToolDefinition]]:
        """``(skill_id, tool)`` pairs for skills in ``effective_skill_ids``."""
        effective = set(effective_skill_ids)
        entitled: list[tuple[str, ToolDefinition]] = []
        for skill_id, skill in self._skills.items():
            if skill_id in effective:
                for tool in skill.tool_definitions():
                    entitled.append((skill_id, tool))
        return entitled

    def system_prompt_sections(self, effective_skill_ids: list[str]) -> list[str]:
        """Skill-specific markdown blocks appended to the system prompt when entitled."""
        effective = set(effective_skill_ids)
        return [
            skill.system_prompt_section()
            for skill_id, skill in self._skills.items()
            if skill_id in effective
        ]

    def execute(
        self,
        skill_id: str,
        tool_name: str,
        args: dict[str, Any],
        ctx: AgentContext,
    ) -> ToolResult:
        """Run one tool after verifying the skill is entitled for this turn."""
        if skill_id not in ctx.effective_skill_ids:
            return ToolResult(ok=False, summary="Skill is not enabled for this restaurant")
        skill = self._skills.get(skill_id)
        if skill is None:
            return ToolResult(ok=False, summary="Skill is not registered")
        return skill.execute(tool_name, args, ctx)
