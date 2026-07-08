import uuid
from unittest.mock import MagicMock

from app.modules.assistant.skills.menu_import.session_context import (
    cancel_active_import_for_restaurant,
    get_active_import_for_conversation,
)


def test_get_active_import_for_conversation_returns_none_on_mismatch():
    conversation_a = uuid.uuid4()
    conversation_b = uuid.uuid4()
    active = MagicMock()
    active.conversation_id = conversation_a

    uow = MagicMock()
    uow.menu_import_sessions.get_active_for_restaurant.return_value = active

    resolved = get_active_import_for_conversation(
        uow,
        restaurant_id=uuid.uuid4(),
        conversation_id=conversation_b,
    )

    assert resolved is None


def test_get_active_import_for_conversation_returns_session_when_ids_match():
    conversation_id = uuid.uuid4()
    active = MagicMock()
    active.conversation_id = conversation_id

    uow = MagicMock()
    uow.menu_import_sessions.get_active_for_restaurant.return_value = active

    resolved = get_active_import_for_conversation(
        uow,
        restaurant_id=uuid.uuid4(),
        conversation_id=conversation_id,
    )

    assert resolved is active


def test_cancel_active_import_for_restaurant_returns_false_when_missing():
    uow = MagicMock()
    uow.menu_import_sessions.get_active_for_restaurant.return_value = None

    assert (
        cancel_active_import_for_restaurant(uow, restaurant_id=uuid.uuid4()) is False
    )
