from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.assistant.skills.base import ToolDefinition

ASSISTANT_JSON_RESPONSE_MARKER = "## JSON response format"


class AgentLLMResponse(BaseModel):
    type: Literal["tool_call", "answer"]
    skill_id: str | None = None
    tool: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)
    content: str | None = None
    language: str = "es"

    @model_validator(mode="after")
    def validate_shape(self) -> AgentLLMResponse:
        if self.type == "tool_call":
            if not self.skill_id or not self.tool:
                raise ValueError("tool_call responses require skill_id and tool")
            return self
        if not (self.content or "").strip():
            raise ValueError("answer responses require non-empty content")
        return self


_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def strip_json_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = _JSON_FENCE_RE.sub("", cleaned).strip()
    return cleaned


def parse_agent_json_response(text: str) -> AgentLLMResponse:
    cleaned = strip_json_fences(text)
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError("LLM response is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("LLM response must be a JSON object")
    response_type = payload.get("type")
    if response_type not in {"tool_call", "answer"}:
        raise ValueError("LLM response type must be tool_call or answer")
    return AgentLLMResponse.model_validate(payload)


def format_tools_for_prompt(entitled_tools: list[tuple[str, ToolDefinition]]) -> str:
    if not entitled_tools:
        return "No tools are currently available for this restaurant."

    lines = ["## Available tools", ""]
    for skill_id, tool in entitled_tools:
        schema = json.dumps(tool.input_schema, ensure_ascii=False)
        lines.append(f"- **{skill_id}.{tool.name}** ({tool.effect}): {tool.description}")
        lines.append(f"  - Args schema: `{schema}`")
    return "\n".join(lines)


def build_tools_prompt_section(entitled_tools: list[tuple[str, ToolDefinition]]) -> str:
    tools_block = format_tools_for_prompt(entitled_tools)
    return f"""{ASSISTANT_JSON_RESPONSE_MARKER}

You MUST respond with exactly one JSON object. Do not wrap it in markdown fences.
Do not include prose outside the JSON object.

### When you need restaurant data from a tool
```json
{{
  "type": "tool_call",
  "skill_id": "menu_read",
  "tool": "search_products",
  "args": {{"query": "pastor"}}
}}
```

### When you can answer directly (no tool needed)
```json
{{
  "type": "answer",
  "content": "Tienes **3 categorías** activas: Tacos, Bebidas, Postres.",
  "language": "es"
}}
```

Rules:
- Prefer a read tool when the owner asks about live menu data
  (categories, products, prices, add-ons).
- Never invent menu data. If no tool is needed, respond with type `answer`.
- For `answer`, write `content` in Spanish markdown unless the owner asked for another language.
- Only use tools listed below. Never call mutate tools unless explicitly allowed in a later phase.

{tools_block}"""
