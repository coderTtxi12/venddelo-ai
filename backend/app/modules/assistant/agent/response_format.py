"""Helpers for the native tool-calling agent loop.

The agent uses the provider's native function calling, so there is no custom JSON
envelope to parse or repair. This module only builds the OpenAI-format tool schemas
exposed to the model and the runtime guidance appended to the system prompt.
"""

from __future__ import annotations

from app.modules.assistant.skills.base import ToolDefinition

# Separator between ``skill_id`` and ``tool_name`` in an OpenAI function name.
# OpenAI function names must match ``^[a-zA-Z0-9_-]+$`` (no dots), so we use ``__``.
FUNCTION_NAME_SEPARATOR = "__"

# Generic progressive-disclosure tool: returns a skill's detailed guide on demand.
LOAD_SKILL_TOOL_NAME = "load_skill"


def openai_function_name(skill_id: str, tool_name: str) -> str:
    return f"{skill_id}{FUNCTION_NAME_SEPARATOR}{tool_name}"


def parse_function_name(name: str) -> tuple[str | None, str]:
    """Split an OpenAI function name into ``(skill_id, tool_name)``.

    ``load_skill`` (and any other unprefixed name) returns ``(None, name)``.
    """
    if FUNCTION_NAME_SEPARATOR not in name:
        return None, name
    skill_id, tool_name = name.split(FUNCTION_NAME_SEPARATOR, 1)
    return skill_id, tool_name


def build_openai_tool_schemas(
    entitled_tools: list[tuple[str, ToolDefinition]],
) -> list[dict]:
    """Build native OpenAI tool schemas for the entitled skill tools."""
    schemas: list[dict] = []
    for skill_id, tool in entitled_tools:
        description = tool.description
        if tool.effect in ("mutate", "delete"):
            description = f"[{tool.effect.upper()}] {description}"
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": openai_function_name(skill_id, tool.name),
                    "description": description,
                    "parameters": tool.input_schema or {"type": "object", "properties": {}},
                },
            }
        )
    return schemas


def build_load_skill_schema(skill_ids: list[str]) -> dict:
    """Schema for the generic ``load_skill`` tool (progressive disclosure)."""
    return {
        "type": "function",
        "function": {
            "name": LOAD_SKILL_TOOL_NAME,
            "description": (
                "Load the detailed guide for one skill before using its tools. "
                "Use it when you need step-by-step instructions or best practices "
                "for a domain. The skill's tools are already available to call."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_id": {
                        "type": "string",
                        "enum": list(skill_ids),
                        "description": "Skill to load the guide for.",
                    }
                },
                "required": ["skill_id"],
            },
        },
    }


def build_agent_runtime_section() -> str:
    """Runtime guidance appended once to the system prompt for the tool-calling loop."""
    return """## How you work

You have native tools. To get live restaurant data or make changes, call a tool —
never invent data. When you have enough information, reply directly with a normal
message (no tool call). For greetings, identity, or general advice, just reply.

- Default to answering. Call a tool only when live data is missing from the context,
  prior tool results, and your menu knowledge. Never call a tool "just in case".
- For detailed guidance or best practices on a domain, call `load_skill` with its
  `skill_id` first; its tools are already available to call.
- Be careful with changes: Plan -> Preview -> Confirm -> Execute. Never delete.
- When updating a product the owner named explicitly, call `update_product` with `name`
  (not a stale `product_id`) or use `bulk_update_product_*` for many rows.
- `price_cents` is always cents (100 MXN = 10000). For bulk description/price/name edits,
  prefer `bulk_update_product_descriptions`, `bulk_update_product_prices`, or
  `bulk_update_product_names` after confirmation.

## Reply style

Write for the restaurant owner, not for engineers. Reply in Spanish unless the owner
asks otherwise, in valid Markdown:
- `**bold**` for key data the owner asked for.
- `-` bullet lists for multiple items; `###` headings for sections.
- Never dump raw tool JSON keys or snake_case field names into your reply.
- One product = one `**Product name**` block; each promotion under it = one bullet.
- Use tables when they make multi-column data clearer. Never return a flat,
  unformatted paragraph when the answer has multiple items.
"""
