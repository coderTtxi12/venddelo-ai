"""SSE payloads for workflow phases."""

from __future__ import annotations

from app.core.llm.ports import ChatStreamEvent
from app.modules.assistant.skills.menu_import.response_schema import MenuImportQuizQuestion

PHASE_LABELS: dict[str, str] = {
    "context": "Preparando contexto",
    "orchestrating": "Pensando y respondiendo",
    "executing": "Investigando y ejecutando",
}


def phase_event(phase: str, *, label: str | None = None) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.phase",
        data={
            "phase": phase,
            "label": label or PHASE_LABELS.get(phase, phase),
        },
    )


def tool_start_event(
    tool: str,
    *,
    call_id: str | None = None,
    args_summary: dict[str, object] | None = None,
    effect: str | None = None,
) -> ChatStreamEvent:
    data: dict[str, object] = {"tool": tool}
    if call_id:
        data["call_id"] = call_id
    if args_summary:
        data["args_summary"] = args_summary
    if effect:
        data["effect"] = effect
    return ChatStreamEvent(event="tool.start", data=data)


def tool_result_event(
    tool: str,
    *,
    call_id: str | None = None,
    ok: bool = True,
    summary: str | None = None,
) -> ChatStreamEvent:
    data: dict[str, object] = {"tool": tool, "ok": ok}
    if call_id:
        data["call_id"] = call_id
    if summary:
        data["summary"] = summary
    return ChatStreamEvent(event="tool.result", data=data)


def agent_thought_event(
    *,
    text: str | None = None,
    delta: str | None = None,
    source: str = "orchestrator",
) -> ChatStreamEvent:
    data: dict[str, object] = {"source": source}
    if text:
        data["text"] = text
    if delta:
        data["delta"] = delta
    return ChatStreamEvent(event="agent.thought", data=data)


def clarify_event(
    *,
    clarify_id: str,
    conversation_id: str,
    question: str,
    choices: list[str] | None,
    multi_select: bool,
    timeout_seconds: int,
) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.clarify",
        data={
            "clarify_id": clarify_id,
            "conversation_id": conversation_id,
            "question": question,
            "choices": choices,
            "multi_select": multi_select,
            "allow_other": True,
            "timeout_seconds": timeout_seconds,
        },
    )


def clarify_closed_event(
    *,
    clarify_id: str,
    reason: str,
) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.clarify_closed",
        data={"clarify_id": clarify_id, "reason": reason},
    )


def menu_import_quiz_event(questions: list[MenuImportQuizQuestion]) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="menu_import.quiz",
        data={
            "questions": [question.model_dump() for question in questions],
        },
    )
