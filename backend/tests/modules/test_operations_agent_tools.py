from agents import FunctionTool

from app.core.config import Settings
from app.modules.assistant.agent.service import build_skill_registry
from app.modules.assistant.agent.tools import (
    OPERATIONS_AGENT_TOOL_NAMES,
    build_executor_function_tools,
    build_operations_function_tools,
    build_orchestrator_function_tools,
)
from app.modules.assistant.agent.workflow.agents import (
    build_catalog_agent,
    build_operations_agent,
)


def _dummy_tool(name: str) -> FunctionTool:
    async def on_invoke_tool(ctx, args):  # noqa: ARG001
        return "{}"

    return FunctionTool(
        name=name,
        description="dummy",
        params_json_schema={"type": "object", "properties": {}},
        on_invoke_tool=on_invoke_tool,
    )


def test_operations_agent_exposes_ops_tools_only():
    registry = build_skill_registry(["menu_write", "menu_read"])
    tools = build_operations_function_tools(registry, ["menu_write", "menu_read"])
    names = {tool.name for tool in tools}
    assert names == OPERATIONS_AGENT_TOOL_NAMES
    assert "list_categories" not in names
    assert "create_product" not in names


def test_catalog_agent_excludes_analyze_product_image():
    registry = build_skill_registry(["menu_intelligence", "menu_write", "menu_read"])
    names = {tool.name for tool in build_executor_function_tools(registry, ["menu_intelligence", "menu_write", "menu_read"])}
    assert "analyze_product_image" not in names


def test_catalog_agent_excludes_ocr_menu_to_bulk_products():
    registry = build_skill_registry(["menu_write", "menu_read"])
    names = {tool.name for tool in build_executor_function_tools(registry, ["menu_write", "menu_read"])}
    assert "ocr_menu_to_bulk_products" not in names
    assert "bulk_create_products" in names


def test_orchestrator_exposes_ocr_menu_to_bulk_products():
    registry = build_skill_registry(["menu_write", "menu_read"])
    names = {tool.name for tool in build_orchestrator_function_tools(registry, ["menu_write", "menu_read"])}
    assert names == {"ocr_menu_to_bulk_products"}


def test_orchestrator_ocr_tool_requires_menu_write_entitlement():
    registry = build_skill_registry(["menu_read"])
    assert build_orchestrator_function_tools(registry, ["menu_read"]) == []


def test_catalog_agent_excludes_operations_tools():
    registry = build_skill_registry(["menu_write", "menu_read"])
    tools = build_executor_function_tools(registry, ["menu_write", "menu_read"])
    names = {tool.name for tool in tools}
    assert "list_categories" in names or "bulk_create_products" in names
    assert names.isdisjoint(OPERATIONS_AGENT_TOOL_NAMES)


def test_build_operations_agent_name_and_tools():
    registry = build_skill_registry(["menu_write"])
    agent = build_operations_agent(
        settings=Settings(),
        registry=registry,
        effective_skill_ids=["menu_write"],
    )
    assert agent.name == "OperationsAgent"
    tool_names = {tool.name for tool in agent.tools}
    assert "get_restaurant_schedules" in tool_names
    assert "get_restaurant_menu_qr" in tool_names
    assert "get_restaurant_name" in tool_names
    assert "assign_restaurant_logo" in tool_names


def test_build_operations_agent_includes_extra_tools():
    registry = build_skill_registry(["menu_write"])
    helper = _dummy_tool("helper_tool")
    agent = build_operations_agent(
        settings=Settings(),
        registry=registry,
        effective_skill_ids=["menu_write"],
        extra_tools=[helper],
    )
    tool_names = {tool.name for tool in agent.tools}
    assert "helper_tool" in tool_names
    assert "clarify" not in tool_names


def test_build_catalog_agent_includes_extra_tools():
    registry = build_skill_registry(["menu_read"])
    helper = _dummy_tool("helper_tool")
    agent = build_catalog_agent(
        settings=Settings(),
        registry=registry,
        effective_skill_ids=["menu_read"],
        extra_tools=[helper],
    )
    tool_names = {tool.name for tool in agent.tools}
    assert "helper_tool" in tool_names
    assert "clarify" not in tool_names


def test_catalog_agent_does_not_expose_branding_tools():
    registry = build_skill_registry(["menu_write", "menu_read"])
    names = {tool.name for tool in build_executor_function_tools(registry, ["menu_write", "menu_read"])}
    for tool_name in (
        "get_restaurant_name",
        "assign_restaurant_logo",
        "remove_restaurant_logo",
        "assign_restaurant_cover",
        "remove_restaurant_cover",
    ):
        assert tool_name not in names
    assert "list_menu_themes" in names or "apply_menu_theme" in names