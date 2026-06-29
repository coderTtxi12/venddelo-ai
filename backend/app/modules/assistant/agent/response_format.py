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
    reason: str | None = None

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
_ANSWER_CONTENT_KEY = '"content"'
_TOOL_TYPE_RE = re.compile(r'"type"\s*:\s*"tool[_-]?call"', re.IGNORECASE)

_CANONICAL_PAYLOAD_KEYS = {
    "type": "type",
    "skillid": "skill_id",
    "tool": "tool",
    "args": "args",
    "content": "content",
    "language": "language",
    "reason": "reason",
}

_RESPONSE_TYPE_ALIASES = {
    "toolcall": "tool_call",
    "answer": "answer",
}


def _compact_identifier(value: str) -> str:
    return value.lower().replace("_", "").replace("-", "").replace(" ", "")


def _normalize_to_known(value: str | None, known: set[str]) -> str | None:
    if value is None or not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed:
        return trimmed
    if trimmed in known:
        return trimmed
    compact = _compact_identifier(trimmed)
    for candidate in known:
        if _compact_identifier(candidate) == compact:
            return candidate
    return trimmed


def _canonicalize_payload_keys(payload: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in payload.items():
        if not isinstance(key, str):
            continue
        canonical = _CANONICAL_PAYLOAD_KEYS.get(_compact_identifier(key))
        if canonical is None:
            continue
        normalized[canonical] = value
    return normalized


def _normalize_response_type(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    return _RESPONSE_TYPE_ALIASES.get(_compact_identifier(value), value)


def _extract_first_json_object(text: str) -> dict[str, Any]:
    cleaned = strip_json_fences(text)
    start = cleaned.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", cleaned, 0)
    payload, _ = json.JSONDecoder().raw_decode(cleaned, start)
    if not isinstance(payload, dict):
        raise ValueError("LLM response must be a JSON object")
    return payload


def _normalize_agent_payload(
    payload: dict[str, Any],
    *,
    known_skill_ids: set[str] | None = None,
    known_tool_names: set[str] | None = None,
) -> dict[str, Any]:
    normalized = _canonicalize_payload_keys(payload)
    normalized["type"] = _normalize_response_type(normalized.get("type"))
    if known_skill_ids:
        normalized["skill_id"] = _normalize_to_known(
            normalized.get("skill_id"),
            known_skill_ids,
        )
    if known_tool_names:
        normalized["tool"] = _normalize_to_known(
            normalized.get("tool"),
            known_tool_names,
        )
    args = normalized.get("args")
    if args is None:
        normalized["args"] = {}
    elif not isinstance(args, dict):
        raise ValueError("tool_call args must be a JSON object")
    return normalized


def strip_json_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = _JSON_FENCE_RE.sub("", cleaned).strip()
    return cleaned


def should_suppress_answer_stream(buffer: str) -> bool:
    stripped = buffer.lstrip()
    if not stripped.startswith("{"):
        return False
    if _TOOL_TYPE_RE.search(stripped):
        return True
    if '"tool_call"' in stripped:
        return True
    if '"type"' in stripped and '"answer"' not in stripped:
        return True
    return False


def _decode_json_string_fragment(raw: str) -> str:
    try:
        return json.loads(f'"{raw}"')
    except json.JSONDecodeError:
        return (
            raw.replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace('\\"', '"')
            .replace("\\\\", "\\")
        )


def extract_partial_answer_content(buffer: str) -> str | None:
    stripped = buffer.lstrip()
    if not stripped:
        return None
    if not stripped.startswith("{"):
        return stripped
    if should_suppress_answer_stream(stripped):
        return None

    key_index = stripped.find(_ANSWER_CONTENT_KEY)
    if key_index == -1:
        return None

    cursor = key_index + len(_ANSWER_CONTENT_KEY)
    while cursor < len(stripped) and stripped[cursor].isspace():
        cursor += 1
    if cursor >= len(stripped) or stripped[cursor] != ":":
        return None
    cursor += 1
    while cursor < len(stripped) and stripped[cursor].isspace():
        cursor += 1
    if cursor >= len(stripped) or stripped[cursor] != '"':
        return None
    cursor += 1

    raw_chars: list[str] = []
    while cursor < len(stripped):
        char = stripped[cursor]
        if char == "\\":
            if cursor + 1 >= len(stripped):
                break
            raw_chars.append(stripped[cursor : cursor + 2])
            cursor += 2
            continue
        if char == '"':
            break
        raw_chars.append(char)
        cursor += 1

    if not raw_chars:
        return None
    return _decode_json_string_fragment("".join(raw_chars))


def parse_agent_json_response(
    text: str,
    *,
    known_skill_ids: set[str] | None = None,
    known_tool_names: set[str] | None = None,
) -> AgentLLMResponse:
    cleaned = strip_json_fences(text)
    try:
        payload = _extract_first_json_object(cleaned)
    except (json.JSONDecodeError, ValueError):
        prose = cleaned.strip()
        if prose:
            return AgentLLMResponse(type="answer", content=prose, language="es")
        raise ValueError("LLM response is not valid JSON") from None

    payload = _normalize_agent_payload(
        payload,
        known_skill_ids=known_skill_ids,
        known_tool_names=known_tool_names,
    )
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
Do not include prose outside the JSON object. Never reply with raw markdown only.
Use exact snake_case field names: `type`, `skill_id`, `tool`, `args`, `reason`,
`content`, `language`.
Never output `toolcall`, `skillid`, or compressed names like `listproducts` —
use `tool_call`, `skill_id`, `list_products`.

### When you need restaurant data from a tool
```json
{{
  "type": "tool_call",
  "skill_id": "menu_read",
  "tool": "list_products",
  "args": {{"limit": 20}},
  "reason": "Owner asked to list all products; live paginated catalog is required."
}}
```

### When you can answer directly (no tool needed)
```json
{{
  "type": "answer",
  "skill_id": "menu_read",
  "content": "Tienes **3 categorías** activas: Tacos, Bebidas, Postres.",
  "language": "es",
  "reason": "Categories were already in the previous tool result; menu_read domain."
}}
```

Rules:
- Output exactly ONE JSON object per turn — never duplicate or concatenate multiple objects.
- Default to `type: "answer"`. Use `tool_call` only when live data is missing from
  context, prior tool results, and MENU knowledge.
- Every JSON object must include `skill_id` and `reason`.
- `skill_id` on `answer` is metadata only — it does not execute the skill.
- `skill_id` is null when no skill domain applies (e.g. greetings).
- `reason` (English, 1–2 sentences): why this path, and why no tool if answering directly.
- Never invent menu data. Never call a tool "just in case".
- For `answer`, write `content` in Spanish markdown unless the owner asked for another language.
- Only use tools listed below. Never call mutate tools unless explicitly allowed in a later phase.

{tools_block}"""
