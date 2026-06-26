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
def test_assistant_chat_streams_stub_response(client, engine):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Assistant", subdomain="assistant-chat"),
            owner_id=OWNER,
        )
        uow.commit()

    with patch("app.modules.assistant.api.build_llm_provider", return_value=StubLLMProvider()):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/chat",
            headers={**AUTH, "Accept": "text/event-stream"},
            json={
                "message": "Hola desde el panel",
                "history": [],
            },
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(response.text)
    assert events[0][0] == "content.delta"
    assert events[-1][0] == "message.complete"
    assert "Hola desde el panel" in events[-1][1]["content"]
    assert events[-1][1]["message_id"]


@requires_db
def test_assistant_chat_requires_owned_restaurant(client, engine):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        uow.users.add(UserCreate(id=OTHER, email="other@example.com"))
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Other", subdomain="other-owner"),
            owner_id=OTHER,
        )
        uow.commit()

    with patch("app.modules.assistant.api.build_llm_provider", return_value=StubLLMProvider()):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/chat",
            headers={**AUTH, "Accept": "text/event-stream"},
            json={"message": "Hola", "history": []},
        )

    assert response.status_code == 403
