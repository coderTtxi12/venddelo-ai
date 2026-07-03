import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.models.assistant import AssistantConversation
from app.db.models.restaurant import Restaurant
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from tests.conftest import requires_db


def _create_restaurant_and_conversation(session) -> tuple[uuid.UUID, uuid.UUID]:
    restaurant = Restaurant(name="Import Test", subdomain=f"import-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    conversation = AssistantConversation(restaurant_id=restaurant.id)
    session.add(conversation)
    session.flush()
    return restaurant.id, conversation.id


@requires_db
def test_only_one_active_session_per_restaurant(session):
    repo = MenuImportSessionRepository(session)
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)

    repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.DISCOVERY,
    )
    with pytest.raises(IntegrityError):
        repo.create(
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            status=MenuImportSessionStatus.COLLECTING_SOURCES,
        )
    session.rollback()


@requires_db
def test_get_active_returns_none_when_completed(session):
    repo = MenuImportSessionRepository(session)
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)

    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.DISCOVERY,
    )
    assert repo.get_active_for_restaurant(restaurant_id) is not None

    import_session.status = MenuImportSessionStatus.COMPLETED.value
    repo.update(import_session)

    assert repo.get_active_for_restaurant(restaurant_id) is None
