import uuid
from unittest.mock import MagicMock, patch

from app.modules.assistant.conversation_store import schedule_persist_turn


def test_schedule_persist_turn_schedules_background_task():
    conversation_id = uuid.uuid4()
    loop = MagicMock()

    with patch("app.modules.assistant.conversation_store.asyncio.get_running_loop", return_value=loop):
        schedule_persist_turn(
            conversation_id=conversation_id,
            user_message="Hola",
            assistant_message="¿En qué te ayudo?",
        )

    loop.create_task.assert_called_once()


def test_schedule_persist_turn_skips_empty_messages():
    loop = MagicMock()

    with patch("app.modules.assistant.conversation_store.asyncio.get_running_loop", return_value=loop):
        schedule_persist_turn(
            conversation_id=uuid.uuid4(),
            user_message="   ",
            assistant_message="respuesta",
        )

    loop.create_task.assert_not_called()
