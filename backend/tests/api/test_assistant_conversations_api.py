import uuid
from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.restaurants.schemas import RestaurantCreate
from app.modules.users.schemas import UserCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}
OTHER = uuid.UUID("22222222-2222-2222-2222-222222222222")


def _seed_restaurant(client, engine, subdomain: str):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Assistant", subdomain=subdomain),
            owner_id=OWNER,
        )
        uow.commit()
    return restaurant


def _parse_sse(raw: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    blocks = [block.strip() for block in raw.split("\n\n") if block.strip()]
    for block in blocks:
        event_name = "message"
        data_line = ""
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line[len("event:") :].strip()
            if line.startswith("data:"):
                data_line = line[len("data:") :].strip()
        if data_line:
            import json

            events.append((event_name, json.loads(data_line)))
    return events


@requires_db
def test_create_and_list_conversations(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-conv-list")

    create = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    )
    assert create.status_code == 201
    conversation_id = create.json()["id"]

    listing = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
    )
    assert listing.status_code == 200
    assert any(item["id"] == conversation_id for item in listing.json()["items"])


@requires_db
def test_stream_persists_messages(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-conv-stream")

    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    )
    assert profile.status_code == 200
    profile_body = profile.json()
    profile_patch = client.patch(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
        json={"display_name": "Luna", "expected_version": profile_body["version"]},
    )
    assert profile_patch.status_code == 200
    profile_version = profile_patch.json()["version"]

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
            json={"message": "Hola desde el panel", "profile_version": profile_version},
        )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert "agent.phase" in [name for name, _ in events]
    assert events[-1][0] == "message.complete"
    assert events[-1][1]["conversation_id"] == conversation_id
    assert "Hola desde el panel" in events[-1][1]["content"]

    messages = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations/{conversation_id}/messages",
        headers=AUTH,
    )
    assert messages.status_code == 200
    roles = [item["role"] for item in messages.json()["items"]]
    assert roles == ["user", "assistant"]


@requires_db
def test_stream_accepts_minimal_profile_snapshot(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-conv-snapshot")

    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    )
    assert profile.status_code == 200
    profile_body = profile.json()
    profile_patch = client.patch(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
        json={"display_name": "Luna", "expected_version": profile_body["version"]},
    )
    assert profile_patch.status_code == 200
    profile_version = profile_patch.json()["version"]

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
            json={
                "message": "Lista todos mis productos",
                "profile_version": profile_version,
                "profile_snapshot": {
                    "display_name": "Luna",
                    "enabled_skill_ids": ["menu_read"],
                },
            },
        )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events[-1][0] == "message.complete"


@requires_db
def test_conversation_requires_owned_restaurant(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        uow.users.add(UserCreate(id=OTHER, email="other@example.com"))
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Other", subdomain="other-assistant-conv"),
            owner_id=OTHER,
        )
        uow.commit()

    response = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    )
    assert response.status_code == 403
