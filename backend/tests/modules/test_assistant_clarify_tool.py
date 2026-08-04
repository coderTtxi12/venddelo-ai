import asyncio
import json
import uuid
from functools import wraps
from unittest.mock import MagicMock

from app.core.config import Settings
from app.modules.assistant.agent.workflow.clarify_registry import ClarifyWaitRegistry
from app.modules.assistant.agent.workflow.clarify_tool import (
    CLARIFY_TOOL_NAME,
    build_clarify_tool,
)


def async_test(func):
    @wraps(func)
    def wrapper():
        asyncio.run(func())

    return wrapper


@async_test
async def test_clarify_rejects_empty_question():
    tool = build_clarify_tool(
        settings=Settings(assistant_clarify_timeout_seconds=1),
        conversation_id=uuid.uuid4(),
        registry=ClarifyWaitRegistry(),
        event_sink=None,
    )

    payload = json.loads(await tool.on_invoke_tool(MagicMock(), json.dumps({"question": "  "})))

    assert tool.name == CLARIFY_TOOL_NAME
    assert payload == {
        "ok": False,
        "error": "question must be a non-empty string.",
    }


@async_test
async def test_clarify_times_out_and_closes_prompt():
    events = []

    async def sink(event):
        events.append(event)

    tool = build_clarify_tool(
        settings=Settings(assistant_clarify_timeout_seconds=1),
        conversation_id=uuid.uuid4(),
        registry=ClarifyWaitRegistry(),
        event_sink=sink,
        timeout_seconds=0.01,
    )

    payload = json.loads(
        await tool.on_invoke_tool(
            MagicMock(),
            json.dumps(
                {
                    "question": "¿Qué horario prefieres?",
                    "choices": ["Mañana", "Tarde"],
                }
            ),
        )
    )

    assert payload == {
        "ok": False,
        "error": "timeout",
        "question": "¿Qué horario prefieres?",
    }
    assert [event.event for event in events] == [
        "agent.status",
        "agent.clarify",
        "agent.clarify_closed",
    ]
    assert events[0].data == {"status": "awaiting_input"}
    assert events[1].data["choices"] == ["Mañana", "Tarde"]
    assert events[1].data["allow_other"] is True
    assert events[1].data["timeout_seconds"] == 0
    assert events[2].data["reason"] == "timeout"


@async_test
async def test_clarify_returns_answer_and_closes_prompt():
    conversation_id = uuid.uuid4()
    registry = ClarifyWaitRegistry()
    events = []

    async def sink(event):
        events.append(event)

    tool = build_clarify_tool(
        settings=Settings(assistant_clarify_timeout_seconds=1),
        conversation_id=conversation_id,
        registry=registry,
        event_sink=sink,
        timeout_seconds=1,
    )
    invocation = asyncio.create_task(
        tool.on_invoke_tool(
            MagicMock(),
            json.dumps(
                {
                    "question": "¿Qué extras agregamos?",
                    "choices": ["Salsa", "Queso"],
                    "multi_select": True,
                }
            ),
        )
    )
    await asyncio.sleep(0)
    clarify_id = registry.get_pending(conversation_id)
    assert clarify_id is not None
    registry.resolve(conversation_id, clarify_id, ["Salsa", "Queso"])

    payload = json.loads(await invocation)

    assert payload == {
        "ok": True,
        "question": "¿Qué extras agregamos?",
        "choices_offered": ["Salsa", "Queso"],
        "multi_select": True,
        "user_response": ["Salsa", "Queso"],
    }
    assert events[-1].event == "agent.clarify_closed"
    assert events[-1].data["reason"] == "answered"


@async_test
async def test_clarify_maps_superseded_registry_result_to_error():
    conversation_id = uuid.uuid4()
    registry = ClarifyWaitRegistry()
    events = []

    async def sink(event):
        events.append(event)

    tool = build_clarify_tool(
        settings=Settings(assistant_clarify_timeout_seconds=1),
        conversation_id=conversation_id,
        registry=registry,
        event_sink=sink,
        timeout_seconds=1,
    )
    first_invocation = asyncio.create_task(
        tool.on_invoke_tool(MagicMock(), json.dumps({"question": "¿Mantengo el precio?"}))
    )
    await asyncio.sleep(0)
    second_invocation = asyncio.create_task(
        tool.on_invoke_tool(MagicMock(), json.dumps({"question": "¿Cambio el precio?"}))
    )
    await asyncio.sleep(0)

    first_payload = json.loads(await first_invocation)
    clarify_id = registry.get_pending(conversation_id)
    assert clarify_id is not None
    registry.fail(conversation_id, clarify_id, "cancelled")
    await second_invocation

    assert first_payload == {
        "ok": False,
        "error": "superseded",
        "question": "¿Mantengo el precio?",
    }
    assert events[-2].event == "agent.clarify_closed"
    assert events[-2].data["reason"] == "superseded"
