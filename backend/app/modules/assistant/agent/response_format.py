"""Helpers for the native tool-calling agent loop.

Builds OpenAI tool schemas, runtime guidance, and parses the assistant's final
JSON envelope (``reasoning`` + ``content``).
"""

from __future__ import annotations

import json
import re

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
never invent data. When you have enough information, send your **final** reply as
JSON (see below). For greetings, identity, or general advice, same JSON format.

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

## Activity reasoning (before tools)

When you are about to call one or more tools, first write 1–2 short sentences in
Spanish explaining what you will do and why (for the restaurant owner watching the
activity panel). Then call the tool(s). Plain text only — **no JSON** on tool rounds.

## Final reply format (required)

When you are done (no more tool calls), respond with **only** a JSON object:

```json
{
  "reasoning": "1–4 oraciones en español: qué revisaste, qué herramientas usaste y por qué.",
  "content": "Tu respuesta completa al dueño del restaurante en Markdown."
}
```

- **`reasoning`**: resumen breve para el panel de actividad (pasos, datos consultados,
  decisiones). No repitas esto en `content`.
- **`content`**: respuesta al dueño en Markdown (negritas, listas, tablas cuando ayuden).
  Sé concreto. Cierra con próximos pasos o preguntas de seguimiento útiles.
- Responde en español salvo que el dueño pida otro idioma.
- No envuelvas el JSON en bloques de código ni añadas texto fuera del objeto.
"""


_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)


def parse_agent_response(raw: str) -> dict[str, str]:
    """Parse the assistant's final JSON envelope.

    Returns ``{"reasoning": str, "content": str}``. On parse failure, treats the
    whole string as ``content`` so older/plain replies still reach the owner.
    """
    text = (raw or "").strip()
    if not text:
        return {"reasoning": "", "content": ""}

    fence = _FENCE_RE.match(text)
    if fence:
        text = fence.group(1).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"reasoning": "", "content": raw.strip()}

    if not isinstance(data, dict):
        return {"reasoning": "", "content": raw.strip()}

    reasoning = data.get("reasoning", "")
    content = data.get("content", "")
    return {
        "reasoning": str(reasoning).strip() if reasoning is not None else "",
        "content": str(content).strip() if content is not None else "",
    }
