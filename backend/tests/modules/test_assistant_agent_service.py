import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import Settings
from app.modules.assistant.agent.service import AssistantAgentService, build_skill_registry
from app.modules.assistant.agent.tools import build_skill_function_tools
from app.modules.assistant.prompts import ASSISTANT_CORE_POLICY
from app.modules.assistant.skills.menu_read.tools import MenuReadSkill


def test_agent_instructions_use_core_policy_only():
    assert "not a generic chatbot" in ASSISTANT_CORE_POLICY.lower()
    assert "## Skill: menu_read" not in ASSISTANT_CORE_POLICY


def test_build_skill_function_tools_exposes_menu_read_tools():
    skill = MenuReadSkill()
    tools = build_skill_function_tools(skill)
    names = {tool.name for tool in tools}
    expected = {
        "list_categories",
        "list_products",
        "search_products",
        "get_product",
        "bulk_get_products",
        "list_promotions",
        "list_product_promotions",
        "get_promotion",
    }
    assert expected.issubset(names)
    assert "load_skill" not in names


def test_run_chat_requires_openai_api_key():
    service = AssistantAgentService(settings=Settings(openai_api_key=None))
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        asyncio.run(
            service.run_chat(
                uow=object(),  # type: ignore[arg-type]
                restaurant_id=uuid.uuid4(),
                message="Hola",
            )
        )


def test_run_chat_delegates_to_orchestrator():
    service = AssistantAgentService(settings=Settings(openai_api_key="sk-test"))
    conversation_id = uuid.uuid4()

    with patch.object(
        service._orchestrator,
        "run_chat",
        new=AsyncMock(return_value=(conversation_id, "Tienes 3 categorías.")),
    ) as orchestrator_mock:
        result = asyncio.run(
            service.run_chat(
                uow=object(),  # type: ignore[arg-type]
                restaurant_id=uuid.uuid4(),
                message="¿Cuántas categorías tengo?",
            )
        )

    assert result.content == "Tienes 3 categorías."
    orchestrator_mock.assert_awaited_once()


async def _collect_stream_events(service, **kwargs):
    events = []
    async for event in service.stream_chat(**kwargs):
        events.append(event)
    return events


def test_stream_chat_emits_deltas_and_complete():
    from app.core.llm.ports import ChatStreamEvent

    service = AssistantAgentService(settings=Settings(openai_api_key="sk-test", langsmith_tracing=False))
    conversation_id = uuid.uuid4()

    async def fake_stream(**kwargs):
        yield ChatStreamEvent(event="agent.phase", data={"phase": "planning", "label": "Planificando"})
        yield ChatStreamEvent(event="content.delta", data={"delta": "Tienes "})
        yield ChatStreamEvent(
            event="message.complete",
            data={"conversation_id": str(conversation_id), "content": "Tienes 3 categorías."},
        )

    with patch.object(service._orchestrator, "stream_chat", side_effect=fake_stream):
        events = asyncio.run(
            _collect_stream_events(
                service,
                uow=object(),  # type: ignore[arg-type]
                restaurant_id=uuid.uuid4(),
                message="¿Cuántas categorías tengo?",
            )
        )

    event_names = [event.event for event in events]
    assert event_names[0] == "agent.phase"
    assert "content.delta" in event_names
    assert event_names[-1] == "message.complete"
    assert events[-1].data["content"] == "Tienes 3 categorías."


def test_build_skill_registry_requires_discovered_executors():
    with pytest.raises(ValueError, match="not registered"):
        build_skill_registry(["nonexistent_skill"])
