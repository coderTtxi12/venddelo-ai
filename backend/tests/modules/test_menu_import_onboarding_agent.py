from app.core.config import Settings
from app.modules.assistant.agent.tools import build_executor_function_tools, build_menu_import_internal_tools
from app.modules.assistant.skills import build_skill_registry
from app.modules.assistant.skills.menu_import.onboarding_agent import (
    MENU_IMPORT_AGENT_NAME,
    build_menu_import_agent,
)
from app.modules.assistant.skills.menu_import.tools import (
    MENU_IMPORT_INTERNAL_TOOL_NAMES,
    MenuImportSkill,
    _pending_source_files,
)


def test_menu_import_internal_tool_names_match_skill():
    skill = MenuImportSkill()
    names = {tool.name for tool in skill.tool_definitions()}
    assert names == MENU_IMPORT_INTERNAL_TOOL_NAMES
    assert "analyze_import_vs_live" in names
    assert len(names) == 14


def test_executor_excludes_menu_import_tools():
    registry = build_skill_registry()
    tools = build_executor_function_tools(
        registry,
        ["menu_import", "menu_read"],
        settings=Settings(),
    )
    names = {tool.name for tool in tools}
    assert "start_menu_import_session" not in names
    assert "apply_full_import" not in names
    assert "list_products" in names


def test_menu_import_handoff_agent_gets_granular_tools():
    registry = build_skill_registry()
    agent = build_menu_import_agent(settings=Settings(), registry=registry)
    assert agent.name == MENU_IMPORT_AGENT_NAME
    tools = build_menu_import_internal_tools(registry)
    names = {tool.name for tool in tools}
    assert names == MENU_IMPORT_INTERNAL_TOOL_NAMES


def test_pending_source_files_skips_already_extracted():
    files = [
        {"path": "restaurants/x/menu/a.pdf", "extracted_at": "2026-01-01T00:00:00+00:00"},
        {"path": "restaurants/x/menu/b.pdf"},
    ]
    pending = _pending_source_files(files, force_reextract=False)
    assert len(pending) == 1
    assert pending[0]["path"].endswith("b.pdf")

    assert len(_pending_source_files(files, force_reextract=True)) == 2
