"""Executor tool catalog for workflow prompts."""

from __future__ import annotations

import re
from typing import Any

from app.modules.assistant.skills.base import ToolDefinition
from app.modules.assistant.skills.discovery import discover_skill_executors

TOOL_GROUPS: list[tuple[str, list[str]]] = [
    (
        "Read menu",
        [
            "list_categories",
            "list_products",
            "search_products",
            "get_product",
            "bulk_get_products",
            "list_promotions",
            "list_product_promotions",
            "get_promotion",
        ],
    ),
    (
        "Write menu — categories & products",
        [
            "create_category",
            "update_category",
            "create_product",
            "update_product",
            "bulk_update_product_names",
            "bulk_update_product_descriptions",
            "bulk_update_product_prices",
            "bulk_update_category_names",
            "bulk_update_category_descriptions",
            "bulk_update_category_sort_indices",
            "bulk_update_category_visibility",
            "bulk_update_category_display_layout",
            "set_category_product_order",
        ],
    ),
    (
        "Write menu — complements / option groups",
        [
            "add_option_group",
            "update_option_group",
            "add_option_item",
            "update_option_item",
            "delete_option_item",
            "bulk_delete_option_items",
            "bulk_update_option_item_visibility",
            "bulk_update_option_item_labels",
            "bulk_update_option_item_prices",
            "bulk_add_option_items",
            "bulk_add_option_groups",
            "set_product_option_group_order",
            "set_option_group_item_order",
        ],
    ),
    (
        "Product photos",
        [
            "assign_product_image",
            "bulk_assign_product_images",
            "match_product_photos",
            "generate_product_image",
        ],
    ),
    (
        "Menu themes",
        [
            "list_menu_themes",
            "get_current_menu_theme",
            "apply_menu_theme",
        ],
    ),
    (
        "Menu intelligence",
        [
            "analyze_product_image",
        ],
    ),
    (
        "Promotions",
        [
            "create_promotion",
            "update_promotion",
            "set_promotion_targets",
            "generate_promotion_banner",
            "disable_promotion",
        ],
    ),
]

COMPACT_DESCRIPTION_MAX_LEN = 110
COMPACT_OPTIONAL_ARG_LIMIT = 3

# One-line output hints for the compact tool catalog (Args + Returns).
TOOL_RETURNS_HINTS: dict[str, str] = {
    # Read menu
    "list_categories": (
        "categories[] (id, name, is_active, category_type, display_layout, sort_index, "
        "visible_in_digital_menu)."
    ),
    "list_products": (
        "products[] FULL detail per row (option_groups[].items[].label, promos, status); "
        "has_more, counts — enough to audit complements without a follow-up fetch."
    ),
    "search_products": (
        "products[] with match_score; suggestions[] on weak match. Full product shape per hit."
    ),
    "get_product": (
        "product (full: option_groups[], promos) or suggestions[] on name miss."
    ),
    "bulk_get_products": (
        "products[] + results[] per input; same payload as get_product. Use only when IDs/names "
        "are already known — not to scan the catalog for a complement label."
    ),
    "list_promotions": "promotions[] paginated; next_cursor, has_more, limit.",
    "list_product_promotions": "promotions[] affecting one product (product_id or name).",
    "get_promotion": "promotion (full rules, targets, schedule, pricing_note).",
    # Write menu — categories & products
    "create_category": "category (id, name, sort_index, is_active).",
    "update_category": "category (updated fields).",
    "create_product": "product (id, name, price_cents, status, category_ids).",
    "update_product": "product (updated fields).",
    "bulk_update_product_names": "updated, failed, results[] per row.",
    "bulk_update_product_descriptions": "updated, failed, results[] per row.",
    "bulk_update_product_prices": "updated, failed, results[] per row.",
    "bulk_update_category_names": "updated, failed, results[] per row.",
    "bulk_update_category_descriptions": "updated, failed, results[] per row.",
    "bulk_update_category_sort_indices": "updated, failed, results[] per row.",
    "bulk_update_category_visibility": "updated, failed, results[] per row.",
    "bulk_update_category_display_layout": "updated, failed, results[] per row.",
    "set_category_product_order": "category_id, ordered product_ids applied.",
    # Write menu — complements / option groups
    "add_option_group": "option_group (id, title, items[]).",
    "update_option_group": "option_group (updated fields).",
    "add_option_item": "option_item (id, label, price_delta_cents).",
    "update_option_item": "option_item (updated fields).",
    "delete_option_item": "item_id, label (hard delete).",
    "bulk_delete_option_items": "updated, failed, results[] per row.",
    "bulk_update_option_item_visibility": (
        "updated, failed, results[]; or menu-wide match_label scan summary."
    ),
    "bulk_update_option_item_labels": "updated, failed, results[] per row.",
    "bulk_update_option_item_prices": "updated, failed, results[] per row.",
    "bulk_add_option_items": "updated, failed, results[] per row (Added).",
    "bulk_add_option_groups": "updated, failed, results[] per row (Added).",
    "set_product_option_group_order": "product_id, ordered group_ids applied.",
    "set_option_group_item_order": "product_id, group_id, ordered item_ids applied.",
    # Product photos
    "assign_product_image": "product_id, image_path assignment confirmation.",
    "bulk_assign_product_images": "updated, failed, results[] per row.",
    "match_product_photos": "matches[] (storage_path → product suggestions, read-only).",
    "generate_product_image": "storage_path, product context (generated asset).",
    # Menu themes
    "list_menu_themes": "themes[] (theme_id, label, active).",
    "get_current_menu_theme": "theme (current digital_menu_theme_id) or null.",
    "apply_menu_theme": "theme (applied digital_menu_theme_id).",
    # Menu intelligence
    "analyze_product_image": "analysis (quality, suggestions; read-only).",
    # Promotions
    "create_promotion": "promotion (id, type, scope, targets).",
    "update_promotion": "promotion (updated fields).",
    "set_promotion_targets": "promotion (targets updated).",
    "generate_promotion_banner": "banner (image_path or asset reference).",
    "disable_promotion": "promotion (is_active=false).",
}


def _collect_tool_definitions() -> dict[str, ToolDefinition]:
    tools: dict[str, ToolDefinition] = {}
    for skill in discover_skill_executors():
        for tool_def in skill.tool_definitions():
            tools.setdefault(tool_def.name, tool_def)
    return tools


def _summarize_description(description: str, *, max_len: int = COMPACT_DESCRIPTION_MAX_LEN) -> str:
    collapsed = " ".join(description.strip().split())
    if not collapsed:
        return "No description."

    sentence_match = re.search(r"[.!?]", collapsed)
    if sentence_match:
        first_sentence = collapsed[: sentence_match.end()].strip()
        if len(first_sentence) <= max_len:
            return first_sentence

    if len(collapsed) <= max_len:
        return collapsed
    return collapsed[: max_len - 1].rstrip() + "…"


def _compact_arg_token(name: str, prop: dict[str, Any], *, required: bool) -> str:
    enum_values = prop.get("enum")
    enum_hint = ""
    if isinstance(enum_values, list) and enum_values:
        preview = "|".join(str(value) for value in enum_values[:4])
        if len(enum_values) > 4:
            preview += "|…"
        enum_hint = f"[{preview}]"

    marker = "*" if required else "?"
    return f"{name}{enum_hint}{marker}"


def _compact_args(schema: dict[str, Any]) -> str:
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        return "none"

    required = set(schema.get("required") or [])
    required_tokens: list[str] = []
    optional_tokens: list[str] = []
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue
        token = _compact_arg_token(name, prop, required=name in required)
        if name in required:
            required_tokens.append(token)
        else:
            optional_tokens.append(token)

    visible_optional = optional_tokens[:COMPACT_OPTIONAL_ARG_LIMIT]
    hidden_optional = len(optional_tokens) - len(visible_optional)
    tokens = required_tokens + visible_optional
    if hidden_optional > 0:
        tokens.append(f"+{hidden_optional} more?")

    return ", ".join(tokens) if tokens else "none"


def format_tool_catalog_entry_compact(tool: ToolDefinition) -> str:
    summary = _summarize_description(tool.description)
    args = _compact_args(tool.input_schema)
    lines = [f"- `{tool.name}` [{tool.effect}]: {summary} Args: {args}."]
    returns_hint = TOOL_RETURNS_HINTS.get(tool.name)
    if returns_hint:
        lines.append(f"  Returns: {returns_hint}")
    return "\n".join(lines)


def _format_property_type(prop: dict[str, Any]) -> str:
    prop_type = prop.get("type")
    if isinstance(prop_type, list):
        return " | ".join(str(item) for item in prop_type)
    if prop_type == "array":
        items = prop.get("items")
        if isinstance(items, dict):
            item_type = items.get("type", "object")
            return f"array<{item_type}>"
        return "array"
    if prop_type:
        return str(prop_type)
    if "enum" in prop:
        return "enum"
    return "object"


def _format_property_line(name: str, prop: dict[str, Any], *, required: bool) -> str:
    requirement = "required" if required else "optional"
    type_label = _format_property_type(prop)
    line = f"- `{name}` ({type_label}, {requirement})"
    if "enum" in prop:
        values = ", ".join(repr(value) for value in prop["enum"])
        line += f" enum: {values}"
    if "default" in prop:
        line += f", default={prop['default']!r}"
    description = str(prop.get("description") or "").strip()
    if description:
        line += f": {description}"
    return line


def _format_input_schema(schema: dict[str, Any]) -> list[str]:
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        return ["**Input:** `{}`"]

    required = set(schema.get("required") or [])
    lines = ["**Input:**"]
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue
        lines.append(_format_property_line(name, prop, required=name in required))
    return lines


def format_tool_catalog_entry(tool: ToolDefinition) -> str:
    lines = [
        f"#### `{tool.name}` ({tool.effect})",
        tool.description.strip(),
        *_format_input_schema(tool.input_schema),
        (
            "**Output:** `{ ok: bool, summary: string, data: object }`. "
            "Read `summary` plus tool-specific fields in `data`."
        ),
    ]
    return "\n".join(lines)


def _build_catalog(*, compact: bool) -> str:
    tools = _collect_tool_definitions()
    sections: list[str] = []

    for section_title, tool_names in TOOL_GROUPS:
        section_lines = [f"### {section_title}"]
        missing: list[str] = []
        for tool_name in tool_names:
            tool = tools.get(tool_name)
            if tool is None:
                missing.append(tool_name)
                continue
            if compact:
                section_lines.append(format_tool_catalog_entry_compact(tool))
            else:
                section_lines.append(format_tool_catalog_entry(tool))
                section_lines.append("")
        if missing:
            section_lines.append(
                "Missing tool definitions: " + ", ".join(f"`{name}`" for name in missing)
            )
        sections.append("\n".join(section_lines).strip())

    return "\n\n".join(sections).strip()


def build_executor_tool_catalog(*, compact: bool = True) -> str:
    """Build the executor tool index (compact by default)."""
    return _build_catalog(compact=compact)


def build_executor_tool_catalog_detailed() -> str:
    """Full tool docs with descriptions and input schemas."""
    return _build_catalog(compact=False)
