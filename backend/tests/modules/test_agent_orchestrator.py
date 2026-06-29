import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.orchestrator import AgentOrchestrator
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.registry import SkillRegistry


class ChunkedLLMProvider(LLMProviderPort):
    def __init__(self, responses: list[list[str]]) -> None:
        self._responses = list(responses)
        self._index = 0

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        if self._index >= len(self._responses):
            raise AssertionError("No more stub LLM responses configured")
        chunks = self._responses[self._index]
        self._index += 1
        parts: list[str] = []
        for chunk in chunks:
            parts.append(chunk)
            yield ChatStreamEvent(event="content.delta", data={"delta": chunk})
        yield ChatStreamEvent(event="message.complete", data={"content": "".join(parts)})


class SequenceLLMProvider(LLMProviderPort):
    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self._index = 0

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        if self._index >= len(self._responses):
            raise AssertionError("No more stub LLM responses configured")
        content = self._responses[self._index]
        self._index += 1
        yield ChatStreamEvent(event="message.complete", data={"content": content})


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

    def system_prompt_section(self) -> str:
        return "Menu read skill section."


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


def test_orchestrator_executes_tool_selected_by_llm_json():
    tool_call = json.dumps(
        {
            "type": "tool_call",
            "skill_id": "menu_read",
            "tool": "search_products",
            "args": {"query": "pastor"},
            "reason": "Voy a buscar el producto en tu catálogo activo.",
        }
    )
    answer = json.dumps(
        {
            "type": "answer",
            "skill_id": "menu_read",
            "content": "Encontré **Taco al pastor**.",
            "language": "es",
            "reason": "Product found in tool result.",
        }
    )
    provider = SequenceLLMProvider([tool_call, answer])
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=["menu_read"],
    )

    events = list(
        orchestrator.stream_chat(
            AssistantChatRequest(message="¿Tienes tacos al pastor?"),
            profile=_profile(),
            ctx=ctx,
        )
    )

    names = [event.event for event in events]
    assert "tool.start" in names
    assert "tool.result" in names
    thought = next(event for event in events if event.event == "agent.thought")
    assert thought.data["text"] == "Voy a buscar el producto en tu catálogo activo."
    complete = next(event for event in events if event.event == "message.complete")
    assert complete.data["content"] == "Encontré **Taco al pastor**."


def test_orchestrator_normalizes_malformed_tool_call_json():
    tool_call = (
        '{"type":"toolcall","skillid":"menuread","tool":"searchproducts",'
        '"args":{"query":"pastor"},"reason":"Need live data."}'
    )
    answer = json.dumps(
        {
            "type": "answer",
            "skill_id": "menu_read",
            "content": "Encontré **Taco al pastor**.",
            "language": "es",
            "reason": "Product found in tool result.",
        }
    )
    provider = SequenceLLMProvider([tool_call, answer])
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=["menu_read"],
    )

    events = list(
        orchestrator.stream_chat(
            AssistantChatRequest(message="¿Tienes tacos al pastor?"),
            profile=_profile(),
            ctx=ctx,
        )
    )

    assert "tool.start" in [event.event for event in events]
    assert "tool.result" in [event.event for event in events]
    assert not any(event.event == "error" for event in events)


def test_orchestrator_accepts_plain_text_llm_answer():
    provider = SequenceLLMProvider(["Me llamo **Mark**."])
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=["menu_read"],
    )

    events = list(
        orchestrator.stream_chat(
            AssistantChatRequest(message="¿Cómo te llamas?"),
            profile=_profile(),
            ctx=ctx,
        )
    )

    complete = next(event for event in events if event.event == "message.complete")
    assert complete.data["content"] == "Me llamo **Mark**."
    assert not any(event.event == "error" for event in events)


def test_orchestrator_streams_answer_deltas_during_llm_generation():
    chunks = [
        '{"type":"answer","content":"Me ',
        "llamo **Mark**.",
        '","language":"es"}',
    ]
    provider = ChunkedLLMProvider([chunks])
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=["menu_read"],
    )

    events = list(
        orchestrator.stream_chat(
            AssistantChatRequest(message="¿Cómo te llamas?"),
            profile=_profile(),
            ctx=ctx,
        )
    )

    deltas = [event.data["delta"] for event in events if event.event == "content.delta"]
    assert len(deltas) >= 2
    assert "".join(deltas) == "Me llamo **Mark**."


def test_orchestrator_runs_plan_then_executes_then_answers():
    plan = json.dumps(
        {
            "type": "plan",
            "skill_id": None,
            "steps": [
                {"id": 1, "goal": "Buscar pastor", "tool_hint": "menu_read.search_products"},
                {"id": 2, "goal": "Responder"},
            ],
            "reason": "Multi-step.",
        }
    )
    tool_call = json.dumps(
        {
            "type": "tool_call",
            "skill_id": "menu_read",
            "tool": "search_products",
            "args": {"query": "pastor"},
            "reason": "Need live data.",
        }
    )
    answer = json.dumps(
        {
            "type": "answer",
            "skill_id": "menu_read",
            "content": "Encontré **Taco al pastor**.",
            "language": "es",
            "reason": "Done.",
        }
    )
    provider = SequenceLLMProvider([plan, tool_call, answer])
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=["menu_read"],
    )

    events = list(
        orchestrator.stream_chat(
            AssistantChatRequest(message="¿Tienes tacos al pastor?"),
            profile=_profile(),
            ctx=ctx,
        )
    )

    names = [event.event for event in events]
    assert "agent.plan" in names
    assert "tool.start" in names
    plan_event = next(event for event in events if event.event == "agent.plan")
    assert [step["id"] for step in plan_event.data["steps"]] == [1, 2]
    complete = next(event for event in events if event.event == "message.complete")
    assert complete.data["content"] == "Encontré **Taco al pastor**."
    assert not any(event.event == "error" for event in events)


def test_orchestrator_emits_plan_update_on_reflection():
    tool_call = json.dumps(
        {
            "type": "tool_call",
            "skill_id": "menu_read",
            "tool": "search_products",
            "args": {"query": "pastor"},
            "reason": "Need live data.",
        }
    )
    plan_update = json.dumps(
        {
            "type": "plan_update",
            "completed_step_ids": [1],
            "decision": "finish",
            "reason": "Tengo lo necesario.",
        }
    )
    answer = json.dumps(
        {
            "type": "answer",
            "skill_id": "menu_read",
            "content": "Listo.",
            "language": "es",
            "reason": "Done.",
        }
    )
    provider = SequenceLLMProvider([tool_call, plan_update, answer])
    # Reflect after every tool to force the plan_update path.
    settings = get_settings().model_copy(update={"assistant_reflection_every": 1})
    orchestrator = AgentOrchestrator(
        provider=provider,
        registry=SkillRegistry([FakeReadSkill()]),
        settings=settings,
    )
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=["menu_read"],
    )

    events = list(
        orchestrator.stream_chat(
            AssistantChatRequest(message="Busca pastor"),
            profile=_profile(),
            ctx=ctx,
        )
    )

    names = [event.event for event in events]
    assert "tool.result" in names
    assert "agent.plan_update" in names
    update_event = next(event for event in events if event.event == "agent.plan_update")
    assert update_event.data["decision"] == "finish"
    complete = next(event for event in events if event.event == "message.complete")
    assert complete.data["content"] == "Listo."
    assert not any(event.event == "error" for event in events)


def test_orchestrator_passthrough_when_menu_read_not_enabled():
    answer = json.dumps(
        {
            "type": "answer",
            "skill_id": None,
            "content": "Hola, ¿en qué te ayudo?",
            "language": "es",
            "reason": "Greeting only.",
        }
    )
    provider = SequenceLLMProvider([answer])
    orchestrator = AgentOrchestrator(provider=provider, registry=SkillRegistry([FakeReadSkill()]))
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=[],
    )

    events = list(
        orchestrator.stream_chat(AssistantChatRequest(message="Hola"), profile=_profile(), ctx=ctx)
    )

    assert any(event.event == "message.complete" for event in events)
    assert not any(event.event == "tool.start" for event in events)
