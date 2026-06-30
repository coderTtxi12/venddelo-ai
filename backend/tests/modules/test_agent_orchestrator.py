import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.orchestrator import AgentOrchestrator
from app.modules.assistant.agent.response_format import openai_function_name
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.registry import SkillRegistry


def _tool_call(name: str, args: dict, call_id: str = "call_1") -> dict:
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


class ScriptedProvider(LLMProviderPort):
    """Emits a scripted sequence of turns (content and/or native tool calls)."""

    def __init__(self, turns: list[dict]) -> None:
        self._turns = list(turns)
        self._index = 0

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        if self._index >= len(self._turns):
            raise AssertionError("No more scripted LLM turns configured")
        turn = self._turns[self._index]
        self._index += 1

        content = turn.get("content", "")
        tool_calls = turn.get("tool_calls")
        chunks = turn.get("content_chunks")

        if chunks:
            parts: list[str] = []
            for chunk in chunks:
                parts.append(chunk)
                yield ChatStreamEvent(event="content.delta", data={"delta": chunk})
            content = "".join(parts)
        elif content:
            yield ChatStreamEvent(event="content.delta", data={"delta": content})

        yield ChatStreamEvent(
            event="message.complete",
            data={"content": content, "tool_calls": tool_calls, "usage": None},
        )


class FakeReadSkill(SkillPort):
    id = "menu_read"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="search_products",
                description="Search products",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            )
        ]

    def execute(self, tool_name: str, args: dict, ctx: AgentContext) -> ToolResult:
        return ToolResult(
            ok=True,
            summary="Found 1 matching product",
            data={"products": [{"name": "Taco al pastor", "query": args.get("query")}]},
        )



def _profile() -> AssistantProfileRecord:
    now = datetime.now(UTC)
    return AssistantProfileRecord(
        restaurant_id=uuid.uuid4(),
        display_name="Luna",
        identity_markdown="# IDENTITY",
        behavior_markdown="# BEHAVIOR",
        menu_markdown="# MENU",
        enabled_skill_ids=["menu_read"],
        version=1,
        created_at=now,
        updated_at=now,
    )


def _ctx(effective: list[str]) -> AgentContext:
    return AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=effective,
    )


def _run(provider: LLMProviderPort, message: str, effective: list[str]) -> list[ChatStreamEvent]:
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    return list(
        orchestrator.stream_chat(
            AssistantChatRequest(message=message),
            profile=_profile(),
            ctx=_ctx(effective),
        )
    )


def test_orchestrator_executes_native_tool_then_answers():
    search = openai_function_name("menu_read", "search_products")
    provider = ScriptedProvider(
        [
            {"tool_calls": [_tool_call(search, {"query": "pastor"})]},
            {"content": "Encontré **Taco al pastor**."},
        ]
    )
    events = _run(provider, "¿Tienes tacos al pastor?", ["menu_read"])

    names = [event.event for event in events]
    assert "tool.start" in names
    assert "tool.result" in names
    start = next(e for e in events if e.event == "tool.start")
    assert start.data["tool"] == "search_products"
    assert start.data["skill_id"] == "menu_read"
    complete = next(e for e in events if e.event == "message.complete")
    assert complete.data["content"] == "Encontré **Taco al pastor**."
    assert not any(e.event == "error" for e in events)


def test_orchestrator_answers_directly_without_tools():
    provider = ScriptedProvider([{"content": "Me llamo **Mark**."}])
    events = _run(provider, "¿Cómo te llamas?", ["menu_read"])

    complete = next(e for e in events if e.event == "message.complete")
    assert complete.data["content"] == "Me llamo **Mark**."
    assert not any(e.event == "tool.start" for e in events)
    assert not any(e.event == "error" for e in events)


def test_orchestrator_streams_answer_deltas():
    provider = ScriptedProvider([{"content_chunks": ["Me ", "llamo **Mark**."]}])
    events = _run(provider, "¿Cómo te llamas?", ["menu_read"])

    deltas = [e.data["delta"] for e in events if e.event == "content.delta"]
    assert len(deltas) >= 2
    assert "".join(deltas) == "Me llamo **Mark**."


def test_orchestrator_load_skill_then_answers():
    provider = ScriptedProvider(
        [
            {"tool_calls": [_tool_call("load_skill", {"skill_id": "menu_read"})]},
            {"content": "Listo, ya revisé la guía."},
        ]
    )
    events = _run(provider, "Ayúdame con el menú", ["menu_read"])

    skills_event = next(e for e in events if e.event == "agent.skills")
    assert skills_event.data["active"] == ["menu_read"]
    complete = next(e for e in events if e.event == "message.complete")
    assert complete.data["content"] == "Listo, ya revisé la guía."
    assert not any(e.event == "error" for e in events)


def test_orchestrator_emits_llm_reasoning_before_tools():
    search = openai_function_name("menu_read", "search_products")
    reasoning = "Voy a buscar productos al pastor en tu menú."
    provider = ScriptedProvider(
        [
            {
                "content": reasoning,
                "tool_calls": [_tool_call(search, {"query": "pastor"})],
            },
            {"content": "Encontré **Taco al pastor**."},
        ]
    )
    events = _run(provider, "¿Tienes tacos al pastor?", ["menu_read"])

    thoughts = [e for e in events if e.event == "agent.thought"]
    assert thoughts
    assert any(reasoning in e.data["text"] for e in thoughts)
    assert not any("Buscar productos" in e.data["text"] for e in thoughts)


def test_orchestrator_emits_plan_for_multiple_tool_calls():
    provider = ScriptedProvider(
        [
            {
                "tool_calls": [
                    _tool_call("load_skill", {"skill_id": "menu_best_practices"}),
                    _tool_call("menu_read__list_products", {"limit": 50}),
                ]
            },
            {"content": "Aquí van mis recomendaciones."},
        ]
    )
    events = _run(provider, "Revisa todo mi menú y hazme recomendaciones", ["menu_read"])

    assert any(e.event == "agent.plan" for e in events)
    assert any(e.event == "agent.plan_update" for e in events)
    assert any(e.event == "message.complete" for e in events)
    assert not any(e.event == "error" for e in events)


def test_orchestrator_unknown_tool_reports_error_and_recovers():
    provider = ScriptedProvider(
        [
            {"tool_calls": [_tool_call("menu_read__delete_everything", {})]},
            {"content": "No puedo hacer eso."},
        ]
    )
    events = _run(provider, "Borra todo", ["menu_read"])

    assert any(e.event == "tool.error" for e in events)
    complete = next(e for e in events if e.event == "message.complete")
    assert complete.data["content"] == "No puedo hacer eso."
    assert not any(e.event == "error" for e in events)


def test_orchestrator_no_tools_when_skill_not_entitled():
    provider = ScriptedProvider([{"content": "Hola, ¿en qué te ayudo?"}])
    events = _run(provider, "Hola", [])

    assert any(e.event == "message.complete" for e in events)
    assert not any(e.event == "tool.start" for e in events)
