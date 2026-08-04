"""Function tool that waits for a user's clarification response."""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from agents import FunctionTool, RunContextWrapper

from app.core.config import Settings
from app.core.llm.ports import ChatStreamEvent
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.workflow.clarify_normalize import (
    normalize_clarify_choices,
)
from app.modules.assistant.agent.workflow.clarify_registry import ClarifyWaitRegistry
from app.modules.assistant.agent.workflow.sse import (
    clarify_closed_event,
    clarify_event,
)

CLARIFY_TOOL_NAME = "clarify"
_HEARTBEAT_SECONDS = 15

EventSink = Callable[[ChatStreamEvent], Awaitable[None] | None]

_CLARIFY_PARAMS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "question": {
            "type": "string",
            "minLength": 1,
            "description": (
                "The question for the user. Put selectable options only in "
                "choices; never include them in question."
            ),
        },
        "choices": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 4,
            "description": "Optional selectable options for the user.",
        },
        "multi_select": {
            "type": "boolean",
            "default": False,
            "description": "Whether the user may select multiple choices.",
        },
    },
    "required": ["question"],
    "additionalProperties": False,
}


async def _emit(sink: EventSink | None, event: ChatStreamEvent) -> None:
    if sink is None:
        return
    result = sink(event)
    if asyncio.iscoroutine(result) or isinstance(result, Awaitable):
        await result  # type: ignore[misc]


async def _heartbeat(sink: EventSink | None) -> None:
    while True:
        await asyncio.sleep(_HEARTBEAT_SECONDS)
        await _emit(sink, ChatStreamEvent(event="agent.status", data={"status": "awaiting_input"}))


def _error_response(error: str, question: str | None = None) -> str:
    payload: dict[str, object] = {"ok": False, "error": error}
    if question is not None:
        payload["question"] = question
    return json.dumps(payload, ensure_ascii=False)


def build_clarify_tool(
    *,
    settings: Settings,
    conversation_id: UUID,
    registry: ClarifyWaitRegistry,
    event_sink: EventSink | None,
    timeout_seconds: float | None = None,
) -> FunctionTool:
    """Build the per-conversation clarify tool."""

    timeout = (
        timeout_seconds
        if timeout_seconds is not None
        else settings.assistant_clarify_timeout_seconds
    )

    async def on_invoke_tool(
        ctx: RunContextWrapper[AssistantRunContext],  # noqa: ARG001
        args: str,
    ) -> str:
        try:
            parsed = json.loads(args) if args else {}
        except json.JSONDecodeError:
            return _error_response("invalid tool arguments")
        if not isinstance(parsed, dict):
            return _error_response("invalid tool arguments")

        question_raw = parsed.get("question")
        if not isinstance(question_raw, str) or not (question := question_raw.strip()):
            return _error_response("question must be a non-empty string.")
        try:
            choices = normalize_clarify_choices(parsed.get("choices"))
        except ValueError as exc:
            return _error_response(str(exc), question)
        multi_select = bool(parsed.get("multi_select", False))

        clarify_id, future = registry.create(conversation_id)
        await _emit(
            event_sink,
            ChatStreamEvent(event="agent.status", data={"status": "awaiting_input"}),
        )
        await _emit(
            event_sink,
            clarify_event(
                clarify_id=str(clarify_id),
                conversation_id=str(conversation_id),
                question=question,
                choices=choices,
                multi_select=multi_select,
                timeout_seconds=int(timeout),
            ),
        )
        heartbeat = asyncio.create_task(_heartbeat(event_sink))
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
        except TimeoutError:
            if registry.get_pending(conversation_id) == clarify_id:
                registry.fail(conversation_id, clarify_id, "timeout")
            await _emit(
                event_sink,
                clarify_closed_event(clarify_id=str(clarify_id), reason="timeout"),
            )
            return _error_response("timeout", question)
        except asyncio.CancelledError:
            if registry.get_pending(conversation_id) == clarify_id:
                registry.fail(conversation_id, clarify_id, "cancelled")
            await _emit(
                event_sink,
                clarify_closed_event(clarify_id=str(clarify_id), reason="cancelled"),
            )
            raise
        finally:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat

        if isinstance(result, dict) and isinstance(error := result.get("__clarify_error__"), str):
            await _emit(
                event_sink,
                clarify_closed_event(clarify_id=str(clarify_id), reason=error),
            )
            return _error_response(error, question)

        user_response: object
        if multi_select and choices and isinstance(result, list):
            user_response = result
        else:
            user_response = str(result)
        await _emit(
            event_sink,
            clarify_closed_event(clarify_id=str(clarify_id), reason="answered"),
        )
        return json.dumps(
            {
                "ok": True,
                "question": question,
                "choices_offered": choices,
                "multi_select": multi_select,
                "user_response": user_response,
            },
            ensure_ascii=False,
        )

    return FunctionTool(
        name=CLARIFY_TOOL_NAME,
        description=(
            "Ask the user a question when you need clarification, feedback, or a "
            "decision before proceeding. Supports three modes:\n"
            "1. Single-select — provide up to 4 choices; the UI adds a 5th "
            "'Other (type your answer)' option.\n"
            "2. Multi-select — set multi_select=true; user_response is a list of "
            "selected choices (may include Other text).\n"
            "3. Open-ended — omit choices; the user types a free-form response.\n"
            "CRITICAL: put options ONLY in the `choices` array — never enumerate "
            "them inside `question`.\n"
            "Use when the task is ambiguous, has meaningful trade-offs, or a "
            "subagent returned notes with needs_user_input:…\n"
            "Prefer a reasonable default yourself when the decision is low-stakes. "
        ),
        params_json_schema=_CLARIFY_PARAMS_SCHEMA,
        on_invoke_tool=on_invoke_tool,
    )
