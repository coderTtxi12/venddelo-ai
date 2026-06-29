from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.api.test_assistant_conversations_api import _parse_sse, _seed_restaurant
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_get_profile_creates_defaults(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-profile-get")

    response = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["chat_ready"] is False
    assert body["version"] == 1
    assert "menu_read" in body["granted_skill_ids"]
    assert len(body["skills_catalog"]) >= 4


@requires_db
def test_chat_blocked_without_display_name(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-profile-gate")

    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    ).json()

    create = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    )
    conversation_id = create.json()["id"]

    response = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations/{conversation_id}/chat",
        headers={**AUTH, "Accept": "text/event-stream"},
        json={"message": "Hola", "profile_version": profile["version"]},
    )
    assert response.status_code == 400


@requires_db
def test_stream_emits_agent_phase_events(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-agent-phase")

    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    ).json()
    updated = client.patch(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
        json={"display_name": "ChefBot", "expected_version": profile["version"]},
    ).json()

    create = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    )
    conversation_id = create.json()["id"]

    with patch("app.modules.assistant.api.build_llm_provider", return_value=StubLLMProvider()):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/conversations/{conversation_id}/chat",
            headers={**AUTH, "Accept": "text/event-stream"},
            json={"message": "Lista mis productos", "profile_version": updated["version"]},
        )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    event_names = [name for name, _ in events]
    assert "agent.phase" in event_names
    assert "message.complete" in event_names
