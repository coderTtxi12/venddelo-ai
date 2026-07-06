"""Skill registry for the agent runtime.

Collects tool executors discovered under ``skills/<id>/tools.py``. Behavioral guides
live in each skill's ``SKILL.md`` and are loaded on demand via ``load_skill`` (see
``skills/markdown.py``), not injected into the initial system prompt.

Delete-effect tools are rejected at construction time, except complement delete tools
(``delete_option_item``, ``bulk_delete_option_items``). ``execute`` re-checks
entitlements against ``AgentContext`` before delegating to the skill.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.markdown import load_skill_guide

# Hard-delete is forbidden for assistant tools except complement removal on one product.
_ALLOWED_DELETE_TOOLS: frozenset[str] = frozenset(
    {
        "delete_option_item",
        "bulk_delete_option_items",
    }
)


def _is_forbidden_delete_tool(tool: ToolDefinition) -> bool:
    if tool.name in _ALLOWED_DELETE_TOOLS:
        return False
    if tool.effect == "delete":
        return True
    return tool.name.lower().startswith("delete_")


class SkillRegistry:
    """Lookup table of registered skills and their tools for one process lifetime."""

    def __init__(self, skills: Iterable[SkillPort]) -> None:
        """Register skills by ``id``; fail fast if any tool has delete effect."""
        self._skills = {skill.id: skill for skill in skills}
        for skill in self._skills.values():
            for tool in skill.tool_definitions():
                if _is_forbidden_delete_tool(tool):
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
        """Full ``SKILL.md`` bodies for on-demand loading (``load_skill`` tool)."""
        sections: list[str] = []
        for skill_id in effective_skill_ids:
            if skill_id not in self._skills:
                continue
            guide = load_skill_guide(skill_id)
            if guide:
                sections.append(guide)
        return sections

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
