from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.assistant.skills.base import ToolDefinition

ASSISTANT_JSON_RESPONSE_MARKER = "## JSON response format"


class PlanStep(BaseModel):
    id: int
    goal: str
    tool_hint: str | None = None
    status: Literal["pending", "done", "skipped"] = "pending"


class AgentLLMResponse(BaseModel):
    type: Literal["tool_call", "answer", "plan", "plan_update"]
    skill_id: str | None = None
    tool: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)
    content: str | None = None
    language: str = "es"
    reason: str | None = None
    # Planning / reflexion fields (plan + plan_update)
    steps: list[PlanStep] | None = None
    completed_step_ids: list[int] = Field(default_factory=list)
    decision: Literal["continue", "replan", "finish"] | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> AgentLLMResponse:
        if self.type == "tool_call":
            if not self.skill_id or not self.tool:
                raise ValueError("tool_call responses require skill_id and tool")
            return self
        if self.type == "plan":
            if not self.steps:
                raise ValueError("plan responses require at least one step")
            return self
        if self.type == "plan_update":
            if self.decision is None:
                raise ValueError("plan_update responses require a decision")
            return self
        if not (self.content or "").strip():
            raise ValueError("answer responses require non-empty content")
        return self


def apply_plan_update(
    steps: list[PlanStep] | None, update: AgentLLMResponse
) -> list[PlanStep]:
    """Apply a ``plan_update`` to the current plan (pure).

    ``revised steps`` (a replan) replace the plan wholesale; otherwise the
    ``completed_step_ids`` are marked ``done`` on the existing steps.
    """
    if update.steps:
        return [step.model_copy() for step in update.steps]
    current = [step.model_copy() for step in (steps or [])]
    completed = set(update.completed_step_ids)
    for step in current:
        if step.id in completed:
            step.status = "done"
    return current


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
    "steps": "steps",
    "plan": "steps",
    "completedstepids": "completed_step_ids",
    "completedsteps": "completed_step_ids",
    "completed": "completed_step_ids",
    "decision": "decision",
}

_RESPONSE_TYPE_ALIASES = {
    "toolcall": "tool_call",
    "answer": "answer",
    "plan": "plan",
    "planupdate": "plan_update",
}

_KNOWN_RESPONSE_TYPES = {"tool_call", "answer", "plan", "plan_update"}


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
    if response_type not in _KNOWN_RESPONSE_TYPES:
        raise ValueError("LLM response type must be tool_call, answer, plan or plan_update")
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


def build_planning_prompt_section(max_steps: int) -> str:
    return f"""### Planning a multi-step task (optional)
For requests that need several tool calls or that combine data (e.g. "how many
products have no promotions", bulk reviews), you MAY first emit a short plan:
```json
{{
  "type": "plan",
  "skill_id": null,
  "steps": [
    {{"id": 1, "goal": "List active products", "tool_hint": "menu_read.list_products"}},
    {{"id": 2, "goal": "List promos, cross-reference", "tool_hint": "menu_read.list_promotions"}}
  ],
  "reason": "Necesito el catálogo y las promos antes de contar; lo haré en dos pasos."
}}
```
Keep it to at most {max_steps} concrete steps. SKIP the plan for trivial/single-step
questions — go straight to `tool_call` or `answer`. `goal` in Spanish, `reason` in Spanish
(shown live to the owner).

### Re-evaluating after a tool result (optional)
After a tool result you MAY revise the plan instead of answering:
```json
{{
  "type": "plan_update",
  "completed_step_ids": [1],
  "decision": "continue",
  "reason": "Ya tengo el catálogo; sigo con las promociones."
}}
```
- `decision`: `continue` (keep executing), `replan` (also include a new `steps` list), or
  `finish` (you have enough — the NEXT turn must be an `answer`).
- Only emit `plan_update` when the plan actually changes or you must replan; otherwise just
  continue with the next `tool_call` or `answer` to save cost.
"""


def build_tools_prompt_section(
    entitled_tools: list[tuple[str, ToolDefinition]],
    *,
    planning_enabled: bool = False,
    plan_max_steps: int = 6,
) -> str:
    tools_block = format_tools_for_prompt(entitled_tools)
    planning_block = (
        build_planning_prompt_section(plan_max_steps) + "\n" if planning_enabled else ""
    )
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
  "reason": "Voy a consultar tu catálogo activo para listar todos los productos sin inventar datos."
}}
```

### When you can answer directly (no tool needed)
```json
{{
  "type": "answer",
  "skill_id": "menu_read",
  "content": "Tienes **3 categorías** activas:\\n\\n- Tacos\\n- Bebidas\\n- Postres",
  "language": "es",
  "reason": "Las categorías ya estaban en el resultado anterior; no necesito otra consulta."
}}
```

Rules:
- Output exactly ONE JSON object per turn — never duplicate or concatenate multiple objects.
- Default to `type: "answer"`. Use `tool_call` only when live data is missing from
  context, prior tool results, and MENU knowledge.
- Every JSON object must include `skill_id` and `reason`.
- `skill_id` on `answer` is metadata only — it does not execute the skill.
- `skill_id` is null when no skill domain applies (e.g. greetings).
- `reason` (Spanish, 1-2 short sentences): it is shown live to the owner as the assistant's
  thinking. Write it in first person and natural Spanish (e.g. "Voy a revisar tus promociones…").
- Never invent menu data. Never call a tool "just in case".
- `content` (the final reply to the owner) MUST be valid Markdown in Spanish (unless the owner
  asked for another language): use `**bold**` for key data, `-` bullet lists for multiple items,
  `###` headings for sections, and line breaks (`\\n`) between blocks. Never return a flat
  unformatted paragraph when the answer has multiple items, also use tables is necesary. It must be a response easy to read by a human.
- Only use tools listed below. Never call mutate tools unless explicitly allowed in a later phase.

{planning_block}{tools_block}"""
