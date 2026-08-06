from app.modules.assistant.agent.workflow.tool_catalog import (
    ORCHESTRATOR_TOOL_GROUPS,
    ORCHESTRATOR_TOOL_RETURNS_HINTS,
    TOOL_GROUPS,
    TOOL_RETURNS_HINTS,
    build_executor_tool_catalog,
    build_executor_tool_catalog_detailed,
    build_orchestrator_tool_catalog,
    format_tool_catalog_entry,
    format_tool_catalog_entry_compact,
)
from app.modules.assistant.skills.base import ToolDefinition


def test_build_executor_tool_catalog_is_compact_by_default():
    compact = build_executor_tool_catalog()
    detailed = build_executor_tool_catalog_detailed()

    assert len(compact) < len(detailed) // 2
    assert "### Read menu" in compact
    assert "`ocr_menu_to_bulk_products`" not in compact
    assert "active_only" not in compact
    assert "#### `ocr_menu_to_bulk_products`" not in compact


def test_build_orchestrator_tool_catalog_includes_ocr_tool():
    catalog = build_orchestrator_tool_catalog()
    assert "### Menu OCR (orchestrator)" in catalog
    assert "`ocr_menu_to_bulk_products` [read]:" in catalog
    assert "Args: storage_paths?" in catalog


def test_catalog_restores_single_product_tools_without_ocr_tool():
    catalog = build_executor_tool_catalog_detailed()
    cataloged = {name for _, names in TOOL_GROUPS for name in names}
    orchestrator_cataloged = {
        name for _, names in ORCHESTRATOR_TOOL_GROUPS for name in names
    }

    assert {"search_products", "create_product"} <= cataloged
    assert "ocr_menu_to_bulk_products" not in cataloged
    assert "bulk_search_products" not in cataloged
    assert {"search_products", "create_product"} <= set(TOOL_RETURNS_HINTS)
    assert "bulk_search_products" not in TOOL_RETURNS_HINTS
    assert "ocr_menu_to_bulk_products" in orchestrator_cataloged
    assert "ocr_menu_to_bulk_products" in ORCHESTRATOR_TOOL_RETURNS_HINTS
    assert "#### `ocr_menu_to_bulk_products` (read)" in build_orchestrator_tool_catalog(
        compact=False
    )


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
