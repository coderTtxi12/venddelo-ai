"""Reference-only skill: digital menu best practices (no tools)."""

from __future__ import annotations

from typing import Any

from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult


class MenuBestPracticesSkill:
    """Venddelo menu design guide. No tools — load the guide via ``load_skill``."""

    id = "menu_best_practices"

    def tool_definitions(self) -> list[ToolDefinition]:
        return []

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        return ToolResult(ok=False, summary="This skill has no tools")
