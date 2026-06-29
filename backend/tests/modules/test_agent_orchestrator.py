import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.orchestrator import AgentOrchestrator
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.registry import SkillRegistry


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
        }
    )
    answer = json.dumps(
        {
            "type": "answer",
            "content": "Encontré **Taco al pastor**.",
            "language": "es",
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
    complete = next(event for event in events if event.event == "message.complete")
    assert complete.data["content"] == "Encontré **Taco al pastor**."


def test_orchestrator_passthrough_when_menu_read_not_enabled():
    answer = json.dumps({"type": "answer", "content": "Hola, ¿en qué te ayudo?", "language": "es"})
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
