from app.modules.assistant.agent.workflow.tool_catalog import (
    TOOL_GROUPS,
    TOOL_RETURNS_HINTS,
    build_executor_tool_catalog,
    build_executor_tool_catalog_detailed,
    format_tool_catalog_entry,
    format_tool_catalog_entry_compact,
)
from app.modules.assistant.skills.base import ToolDefinition


def test_build_executor_tool_catalog_is_compact_by_default():
    compact = build_executor_tool_catalog()
    detailed = build_executor_tool_catalog_detailed()

    assert len(compact) < len(detailed) // 3
    assert "### Read menu" in compact
    assert "`search_products` [read]:" in compact
    assert "Args: query*" in compact
    assert "active_only" not in compact
    assert "#### `search_products`" not in compact


def test_build_executor_tool_catalog_detailed_includes_rich_search_products_entry():
    catalog = build_executor_tool_catalog_detailed()

    assert "#### `search_products` (read)" in catalog
    assert "Search products by **name**" in catalog
    assert "`query` (string, required)" in catalog
    assert "**Output:** `{ ok: bool, summary: string, data: object }`" in catalog


def test_format_tool_catalog_entry_compact_truncates_long_descriptions():
    tool = ToolDefinition(
        name="demo_tool",
        description=(
            "First sentence is short. "
            "Second sentence should usually be omitted from the compact catalog entry "
            "because the summary prefers the first sentence when it fits."
        ),
        effect="read",
        input_schema={"type": "object", "properties": {}},
    )

    rendered = format_tool_catalog_entry_compact(tool)

    assert rendered.startswith("- `demo_tool` [read]: First sentence is short.")
    assert "Second sentence" not in rendered


def test_format_tool_catalog_entry_renders_enums_and_defaults():
    tool = ToolDefinition(
        name="demo_tool",
        description="Demo tool for formatting.",
        effect="mutate",
        input_schema={
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["a", "b"],
                    "description": "Mode selector.",
                },
                "force": {
                    "type": "boolean",
                    "default": False,
                    "description": "Force execution.",
                },
            },
            "required": ["mode"],
        },
    )

    compact = format_tool_catalog_entry_compact(tool)
    detailed = format_tool_catalog_entry(tool)

    assert "mode[a|b]*" in compact
    assert "force?" in compact
    assert "enum: 'a', 'b'" in detailed
    assert "default=False" in detailed


def test_compact_catalog_includes_returns_hints_for_read_menu_tools():
    catalog = build_executor_tool_catalog()

    assert "Returns: products[] FULL detail per row" in catalog
    assert "option_groups[].items[].label" in catalog
    assert (
        "Returns: products[] + results[] per input; same payload as get_product"
        in catalog
    )
    assert "not to scan the catalog for a complement label" in catalog


def test_all_cataloged_tools_have_returns_hints():
    cataloged = {name for _, names in TOOL_GROUPS for name in names}
    missing = sorted(cataloged - TOOL_RETURNS_HINTS.keys())
    assert missing == []


def test_format_tool_catalog_entry_compact_appends_returns_line():
    tool = ToolDefinition(
        name="list_products",
        description="List products in the menu.",
        effect="read",
        input_schema={"type": "object", "properties": {}},
    )

    rendered = format_tool_catalog_entry_compact(tool)

    assert rendered.startswith("- `list_products` [read]:")
    assert "  Returns: products[] FULL detail per row" in rendered
