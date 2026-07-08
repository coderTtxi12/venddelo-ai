from app.core.config import Settings
from app.modules.assistant.agent.tools import (
    MENU_IMPORT_ONBOARDING_TOOL_NAME,
    build_executor_function_tools,
    build_menu_import_internal_tools,
)
from app.modules.assistant.skills import build_skill_registry
from app.modules.assistant.skills.menu_import.onboarding_agent import (
    menu_import_onboarding_tool_definition,
)
from app.modules.assistant.skills.menu_import.tools import (
    MENU_IMPORT_INTERNAL_TOOL_NAMES,
    MenuImportSkill,
)


def test_menu_import_internal_tool_names_match_skill():
    skill = MenuImportSkill()
    names = {tool.name for tool in skill.tool_definitions()}
    assert names == MENU_IMPORT_INTERNAL_TOOL_NAMES
    assert "analyze_import_vs_live" in names
    assert len(names) == 14


def test_executor_exposes_onboarding_not_granular_menu_import():
    registry = build_skill_registry()
    settings = Settings()
    tools = build_executor_function_tools(
        registry,
        ["menu_import", "menu_read"],
        settings=settings,
    )
    names = {tool.name for tool in tools}
    assert MENU_IMPORT_ONBOARDING_TOOL_NAME in names
    assert "start_menu_import_session" not in names
    assert "apply_full_import" not in names
    assert "list_products" in names


def test_internal_onboarding_agent_gets_granular_tools():
    registry = build_skill_registry()
    tools = build_menu_import_internal_tools(registry)
    names = {tool.name for tool in tools}
    assert names == MENU_IMPORT_INTERNAL_TOOL_NAMES


def test_onboarding_tool_definition_for_planner_catalog():
    tool = menu_import_onboarding_tool_definition()
    assert tool.name == MENU_IMPORT_ONBOARDING_TOOL_NAME
    assert tool.effect == "mutate"
    assert "request" in tool.input_schema.get("properties", {})
