"""Map OpenAI Agents SDK stream events to assistant SSE payloads."""

from __future__ import annotations

import json
import re
from typing import Any

from agents.items import ReasoningItem, ToolCallItem, ToolCallOutputItem
from agents.stream_events import RawResponsesStreamEvent, RunItemStreamEvent
from openai.types.responses.response_text_delta_event import ResponseTextDeltaEvent

from app.core.llm.ports import ChatStreamEvent
from app.modules.assistant.agent.workflow.sse import agent_thought_event, tool_result_event, tool_start_event
from app.modules.assistant.skills.registry import SkillRegistry

_REASON_FIELD_RE = re.compile(r'"reason"\s*:\s*"((?:\\.|[^"\\])*)', re.DOTALL)

_SUMMARY_ARG_KEYS = (
    "query",
    "name",
    "product_name",
    "skill_id",
    "category_name",
    "search",
    "limit",
    "promotion_name",
)


def _coerce_args(raw: object) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def summarize_tool_args(args: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for key in _SUMMARY_ARG_KEYS:
        value = args.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            text = value.strip()
            if not text:
                continue
            summary[key] = text if len(text) <= 80 else f"{text[:77]}…"
            continue
        if isinstance(value, (int, float, bool)):
            summary[key] = value
    items = args.get("items") or args.get("products")
    if isinstance(items, list) and items:
        summary["items"] = len(items)
    return summary


def summarize_tool_output(output: object) -> tuple[bool, str | None]:
    if output is None:
        return True, None
    if isinstance(output, str):
        text = output.strip()
        if not text:
            return True, None
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return True, text[:120] if len(text) > 120 else text
        if isinstance(parsed, dict):
            ok = parsed.get("ok", True) is not False
            summary = parsed.get("summary")
            if isinstance(summary, str) and summary.strip():
                clipped = summary.strip()
                return ok, clipped if len(clipped) <= 120 else f"{clipped[:117]}…"
            return ok, None
        return True, text[:120] if len(text) > 120 else text
    if isinstance(output, dict):
        ok = output.get("ok", True) is not False
        summary = output.get("summary")
        if isinstance(summary, str) and summary.strip():
            clipped = summary.strip()
            return ok, clipped if len(clipped) <= 120 else f"{clipped[:117]}…"
        return ok, None
    return True, None


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


def extract_partial_reason(json_buffer: str) -> str:
    """Best-effort extraction of the router ``reason`` field from partial JSON."""
    match = _REASON_FIELD_RE.search(json_buffer)
    if match:
        return _decode_json_string_fragment(match.group(1))

    marker = '"reason"'
    idx = json_buffer.find(marker)
    if idx == -1:
        return ""

    rest = json_buffer[idx + len(marker) :].lstrip()
    if not rest.startswith(":"):
        return ""
    rest = rest[1:].lstrip()
    if not rest.startswith('"'):
        return ""

    chars: list[str] = []
    i = 1
    while i < len(rest):
        char = rest[i]
        if char == "\\" and i + 1 < len(rest):
            chars.append(rest[i + 1])
            i += 2
            continue
        if char == '"':
            break
        chars.append(char)
        i += 1
    return _decode_json_string_fragment("".join(chars))


class RouterReasonStreamParser:
    """Track the router JSON stream and emit only new ``reason`` text."""

    def __init__(self) -> None:
        self._buffer = ""
        self.emitted_reason = ""

    def push_delta(self, delta: str) -> str | None:
        if not delta:
            return None
        self._buffer += delta
        current = extract_partial_reason(self._buffer)
        if not current or len(current) <= len(self.emitted_reason):
            return None
        if not current.startswith(self.emitted_reason):
            new_text = current
        else:
            new_text = current[len(self.emitted_reason) :]
        if not new_text:
            return None
        self.emitted_reason = current
        return new_text


def map_router_stream_event(
    event: object,
    *,
    reason_parser: RouterReasonStreamParser,
) -> ChatStreamEvent | None:
    if isinstance(event, RawResponsesStreamEvent) and isinstance(event.data, ResponseTextDeltaEvent):
        reason_delta = reason_parser.push_delta(event.data.delta or "")
        if reason_delta:
            return agent_thought_event(delta=reason_delta, source="router")
    return None


def _reasoning_summary_text(item: object) -> str | None:
    if not isinstance(item, ReasoningItem):
        return None
    raw = item.raw_item
    summary = getattr(raw, "summary", None)
    if not isinstance(summary, list):
        return None
    parts: list[str] = []
    for part in summary:
        text = getattr(part, "text", None)
        if text is None and isinstance(part, dict):
            text = part.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
    if not parts:
        return None
    return " ".join(parts)


def _reasoning_delta(raw_event: object) -> str | None:
    event_type = getattr(raw_event, "type", None)
    if event_type == "response.reasoning_summary_text.delta":
        delta = getattr(raw_event, "delta", None)
        return delta if isinstance(delta, str) and delta else None
    delta_type = type(raw_event).__name__
    if delta_type == "ResponseReasoningSummaryTextDeltaEvent":
        delta = getattr(raw_event, "delta", None)
        return delta if isinstance(delta, str) and delta else None
    return None


def _tool_effect(
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    tool_name: str,
) -> str:
    resolved = registry.resolve_tool(tool_name, effective_skill_ids)
    if resolved is None:
        return "read"
    return resolved[1].effect


def parse_tool_call(item: object) -> dict[str, Any] | None:
    if not isinstance(item, ToolCallItem):
        return None
    raw = item.raw_item
    name = getattr(raw, "name", None)
    if not isinstance(name, str) or not name.strip():
        return None
    call_id = getattr(raw, "call_id", None) or getattr(raw, "id", None)
    arguments = _coerce_args(getattr(raw, "arguments", None))
    return {
        "tool": name.strip(),
        "call_id": call_id if isinstance(call_id, str) else None,
        "args_summary": summarize_tool_args(arguments),
    }


def parse_tool_output(item: object) -> dict[str, Any] | None:
    if not isinstance(item, ToolCallOutputItem):
        return None
    raw = item.raw_item
    call_id = getattr(raw, "call_id", None) or getattr(raw, "id", None)
    output = getattr(item, "output", None)
    if output is None:
        output = getattr(raw, "output", None)
    ok, summary = summarize_tool_output(output)
    tool_name = getattr(raw, "name", None)
    return {
        "tool": tool_name.strip() if isinstance(tool_name, str) else "tool",
        "call_id": call_id if isinstance(call_id, str) else None,
        "ok": ok,
        "summary": summary,
    }


def map_agent_stream_event(
    event: object,
    *,
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    include_text_deltas: bool,
    include_reasoning_deltas: bool = False,
) -> ChatStreamEvent | None:
    if isinstance(event, RawResponsesStreamEvent):
        if include_reasoning_deltas:
            reasoning_delta = _reasoning_delta(event.data)
            if reasoning_delta:
                return agent_thought_event(delta=reasoning_delta, source="reasoning")
        if include_text_deltas and isinstance(event.data, ResponseTextDeltaEvent):
            delta = event.data.delta
            if delta:
                return ChatStreamEvent(event="content.delta", data={"delta": delta})
        return None

    if not isinstance(event, RunItemStreamEvent):
        return None

    if event.name == "reasoning_item_created":
        reasoning_text = _reasoning_summary_text(event.item)
        if reasoning_text:
            return agent_thought_event(text=reasoning_text, source="reasoning")
        return None

    if event.name == "tool_called":
        payload = parse_tool_call(event.item)
        if payload is None:
            return None
        effect = _tool_effect(registry, effective_skill_ids, payload["tool"])
        return tool_start_event(
            payload["tool"],
            call_id=payload["call_id"],
            args_summary=payload["args_summary"] or None,
            effect=effect,
        )

    if event.name == "tool_output":
        payload = parse_tool_output(event.item)
        if payload is None:
            return None
        return tool_result_event(
            payload["tool"],
            call_id=payload["call_id"],
            ok=payload["ok"],
            summary=payload["summary"],
        )

    return None
