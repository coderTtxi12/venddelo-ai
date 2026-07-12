from types import SimpleNamespace

from agents.items import ReasoningItem, ToolCallItem, ToolCallOutputItem
from agents.stream_events import RawResponsesStreamEvent, RunItemStreamEvent

from app.modules.assistant.agent.service import build_skill_registry
from app.modules.assistant.agent.workflow.sse import agent_thought_event
from app.modules.assistant.agent.workflow.stream_mapping import (
    RouterReasonStreamParser,
    extract_partial_reason,
    map_agent_stream_event,
    map_router_stream_event,
    parse_tool_call,
    summarize_tool_args,
    summarize_tool_output,
)
from openai.types.responses.response_text_delta_event import ResponseTextDeltaEvent


class _FakeAgent:
    def __init__(self, name: str) -> None:
        self.name = name


def test_summarize_tool_args_keeps_short_search_fields():
    summary = summarize_tool_args({"query": "tacos al pastor", "limit": 5})
    assert summary["query"] == "tacos al pastor"
    assert summary["limit"] == 5


def test_summarize_tool_output_reads_json_summary():
    ok, summary = summarize_tool_output('{"ok": true, "summary": "2 categorías encontradas"}')
    assert ok is True
    assert summary == "2 categorías encontradas"


def test_map_agent_stream_event_emits_tool_start():
    registry = build_skill_registry(["menu_read"])
    item = ToolCallItem(
        agent=_FakeAgent("Executor"),
        raw_item=SimpleNamespace(
            name="list_categories",
            call_id="call-1",
            arguments='{"limit": 20}',
        ),
    )
    event = RunItemStreamEvent(name="tool_called", item=item)
    mapped = map_agent_stream_event(
        event,
        registry=registry,
        effective_skill_ids=["menu_read"],
        include_text_deltas=False,
    )
    assert mapped is not None
    assert mapped.event == "tool.start"
    assert mapped.data["tool"] == "list_categories"
    assert mapped.data["call_id"] == "call-1"
    assert mapped.data["effect"] == "read"


def test_map_agent_stream_event_emits_tool_result():
    item = ToolCallOutputItem(
        agent=_FakeAgent("Executor"),
        raw_item=SimpleNamespace(call_id="call-1", name="list_categories"),
        output='{"ok": true, "summary": "Hay 2 categorías"}',
    )
    event = RunItemStreamEvent(name="tool_output", item=item)
    mapped = map_agent_stream_event(
        event,
        registry=build_skill_registry(["menu_read"]),
        effective_skill_ids=["menu_read"],
        include_text_deltas=False,
    )
    assert mapped is not None
    assert mapped.event == "tool.result"
    assert mapped.data["ok"] is True
    assert mapped.data["summary"] == "Hay 2 categorías"


def test_extract_partial_reason_from_complete_json():
    payload = (
        '{"route":"executor","goal":"Listar categorías",'
        '"reason":"El usuario pregunta por categorías del menú live."}'
    )
    assert extract_partial_reason(payload) == "El usuario pregunta por categorías del menú live."


def test_router_reason_stream_parser_streams_reason_incrementally():
    parser = RouterReasonStreamParser()
    first = parser.push_delta('{"route":"executor","goal":"x","reason":"El usuario')
    second = parser.push_delta(" pregunta por categorías." + '"}')
    assert first == "El usuario"
    assert second == " pregunta por categorías."
    assert parser.emitted_reason == "El usuario pregunta por categorías."


def test_map_router_stream_event_emits_reason_delta():
    parser = RouterReasonStreamParser()
    event = RawResponsesStreamEvent(
        data=ResponseTextDeltaEvent(
            content_index=0,
            delta='{"route":"executor","goal":"x","reason":"Consulta menú',
            item_id="item-1",
            logprobs=[],
            output_index=0,
            sequence_number=1,
            type="response.output_text.delta",
        )
    )
    mapped = map_router_stream_event(event, reason_parser=parser)
    assert mapped == agent_thought_event(delta="Consulta menú", source="router")


def test_parse_tool_call_returns_none_for_unknown_item():
    assert parse_tool_call(object()) is None


def test_map_agent_stream_event_emits_reasoning_delta():
    raw = SimpleNamespace(type="response.reasoning_summary_text.delta", delta="Revisando el menú")
    event = RawResponsesStreamEvent(data=raw)
    mapped = map_agent_stream_event(
        event,
        registry=build_skill_registry(["menu_read"]),
        effective_skill_ids=["menu_read"],
        include_text_deltas=False,
        include_reasoning_deltas=True,
    )
    assert mapped == agent_thought_event(delta="Revisando el menú", source="reasoning")


def test_map_agent_stream_event_emits_reasoning_item_created():
    item = ReasoningItem(
        agent=_FakeAgent("Router"),
        raw_item=SimpleNamespace(
            id="rs_1",
            type="reasoning",
            summary=[SimpleNamespace(text="Necesito consultar categorías.")],
        ),
    )
    event = RunItemStreamEvent(name="reasoning_item_created", item=item)
    mapped = map_agent_stream_event(
        event,
        registry=build_skill_registry(["menu_read"]),
        effective_skill_ids=["menu_read"],
        include_text_deltas=False,
        include_reasoning_deltas=True,
    )
    assert mapped == agent_thought_event(
        text="Necesito consultar categorías.",
        source="reasoning",
    )
