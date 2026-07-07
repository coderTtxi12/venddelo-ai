from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.modules.assistant.skills.context import AgentContext

ToolEffect = Literal["read", "mutate", "delete"]


class ToolDefinition(BaseModel):
    name: str = Field(min_length=1)
    description: str
    effect: ToolEffect
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    ok: bool
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)


class SkillPort(Protocol):
    id: str

    def tool_definitions(self) -> list[ToolDefinition]: ...

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult: ...
