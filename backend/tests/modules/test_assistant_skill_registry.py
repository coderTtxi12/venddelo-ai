
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_read.tools import MenuReadSkill
from app.modules.assistant.skills.registry import SkillRegistry


class FakeReadSkill(SkillPort):
    id = "fake_read"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="fake_read_tool",
                description="Read something",
                effect="read",
                input_schema={"type": "object", "properties": {}},
            )
        ]

    def execute(self, tool_name: str, args: dict, ctx: AgentContext) -> ToolResult:
        return ToolResult(
            ok=True,
            summary="read ok",
            data={"restaurant_id": str(ctx.restaurant_id)},
        )


def test_registry_filters_tools_by_effective_skill_ids():
    registry = SkillRegistry([FakeReadSkill()])

    assert registry.tool_definitions(effective_skill_ids=[]) == []
    tools = registry.tool_definitions(effective_skill_ids=["fake_read"])

    assert [tool.name for tool in tools] == ["fake_read_tool"]


def test_registry_rejects_delete_tools():
    class BadSkill(FakeReadSkill):
        id = "bad"

        def tool_definitions(self) -> list[ToolDefinition]:
            return [
                ToolDefinition(
                    name="delete_product",
                    description="Should never be exposed",
                    effect="delete",
                    input_schema={"type": "object", "properties": {}},
                )
            ]

    try:
        SkillRegistry([BadSkill()])
    except ValueError as exc:
        assert "delete" in str(exc)
    else:
        raise AssertionError("delete tool was accepted")


def test_registry_loads_skill_guide_from_skill_md():
    registry = SkillRegistry([MenuReadSkill()])
    sections = registry.system_prompt_sections(["menu_read"])
    assert len(sections) == 1
    assert "list_categories" in sections[0]
    assert sections[0].startswith("# menu_read")
