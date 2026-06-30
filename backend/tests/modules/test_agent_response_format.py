from app.modules.assistant.agent.response_format import (
    LOAD_SKILL_TOOL_NAME,
    build_agent_runtime_section,
    build_load_skill_schema,
    build_openai_tool_schemas,
    openai_function_name,
    parse_function_name,
)
from app.modules.assistant.skills.base import ToolDefinition


def test_function_name_roundtrip():
    name = openai_function_name("menu_read", "search_products")
    assert name == "menu_read__search_products"
    assert parse_function_name(name) == ("menu_read", "search_products")


def test_parse_function_name_without_separator():
    assert parse_function_name("load_skill") == (None, "load_skill")


def test_build_openai_tool_schemas_marks_effect_and_uses_function_name():
    tools = [
        (
            "menu_read",
            ToolDefinition(
                name="search_products",
                description="Search products by name.",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
        ),
        (
            "menu_write",
            ToolDefinition(
                name="update_product",
                description="Update a product.",
                effect="mutate",
                input_schema={"type": "object", "properties": {}},
            ),
        ),
    ]
    schemas = build_openai_tool_schemas(tools)
    names = [s["function"]["name"] for s in schemas]
    assert names == ["menu_read__search_products", "menu_write__update_product"]
    assert schemas[0]["type"] == "function"
    assert schemas[0]["function"]["parameters"]["required"] == ["query"]
    assert schemas[1]["function"]["description"].startswith("[MUTATE]")


def test_build_load_skill_schema_enumerates_skills():
    schema = build_load_skill_schema(["menu_read", "menu_write"])
    assert schema["function"]["name"] == LOAD_SKILL_TOOL_NAME
    props = schema["function"]["parameters"]["properties"]
    assert props["skill_id"]["enum"] == ["menu_read", "menu_write"]


def test_runtime_section_has_style_and_tool_guidance():
    section = build_agent_runtime_section()
    assert "load_skill" in section
    assert "Markdown" in section
    assert "Never delete" in section
