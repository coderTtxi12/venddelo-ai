import asyncio
import uuid
from functools import wraps
from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import NotFoundError
from app.modules.assistant.agent.workflow.clarify_registry import ClarifyWaitRegistry
from app.modules.assistant.api import answer_assistant_clarify
from app.modules.assistant.schemas import AssistantClarifyAnswerRequest


def async_test(func):
    @wraps(func)
    def wrapper():
        asyncio.run(func())

    return wrapper


@async_test
async def test_answer_assistant_clarify_resolves_pending_future_on_creator_loop():
    registry = ClarifyWaitRegistry()
    conversation_id = uuid.uuid4()
    clarify_id, future = registry.create(conversation_id)

    with patch(
        "app.modules.assistant.api.get_clarify_registry",
        return_value=registry,
    ):
        result = await answer_assistant_clarify(
            body=AssistantClarifyAnswerRequest(
                conversation_id=conversation_id,
                clarify_id=clarify_id,
                user_response="Sí, mantenlo",
            ),
            restaurant=MagicMock(),
        )

    assert result == {"ok": True}
    assert future.done()
    assert future.result() == "Sí, mantenlo"


@async_test
async def test_answer_assistant_clarify_returns_not_found_for_unknown_id():
    registry = ClarifyWaitRegistry()

    with patch(
        "app.modules.assistant.api.get_clarify_registry",
        return_value=registry,
    ):
        with pytest.raises(NotFoundError):
            await answer_assistant_clarify(
                body=AssistantClarifyAnswerRequest(
                    conversation_id=uuid.uuid4(),
                    clarify_id=uuid.uuid4(),
                    user_response="Sí",
                ),
                restaurant=MagicMock(),
            )
