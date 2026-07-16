import uuid
from unittest.mock import AsyncMock, patch

from sqlalchemy.orm import sessionmaker

from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


def _seed_restaurant(client, engine, subdomain: str):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Assistant Agent", subdomain=subdomain),
            owner_id=OWNER,
        )
        uow.commit()
    return restaurant


async def _fake_stream_chat(**kwargs):
    conversation_id = kwargs.get("conversation_id") or uuid.uuid4()
    yield ChatStreamEvent(event="content.delta", data={"delta": "Tienes "})
    yield ChatStreamEvent(
        event="message.complete",
        data={
            "conversation_id": str(conversation_id),
            "content": "Tienes la categoría Tacos.",
        },
    )


@requires_db
def test_assistant_chat_streams_agent_reply(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-agent-chat")
    conversation_id = uuid.uuid4()

    with patch(
        "app.modules.assistant.api.AssistantAgentService.stream_chat",
        side_effect=_fake_stream_chat,
    ):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/chat",
            json={"message": "¿Qué categorías tengo?", "conversation_id": str(conversation_id)},
            headers={**AUTH, "Accept": "text/event-stream"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: content.delta" in body
    assert "Tienes " in body
    assert "event: message.complete" in body
    assert "Tienes la categoría Tacos." in body
    assert str(conversation_id) in body


@requires_db
def test_assistant_chat_requires_message_or_attachments(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-agent-empty")

    response = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/chat",
        json={"message": "   "},
        headers=AUTH,
    )

    assert response.status_code == 422


@requires_db
def test_assistant_chat_accepts_attachments_only_payload(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-agent-attachments")

    with patch(
        "app.modules.assistant.api.AssistantAgentService.stream_chat",
        side_effect=_fake_stream_chat,
    ):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/chat",
            json={
                "message": "",
                "attachments": [
                    {
                        "storage_path": f"restaurants/{restaurant.id}/import/inbox/menu.pdf",
                        "original_name": "menu.pdf",
                        "mime_type": "application/pdf",
                        "kind": "document",
                        "size_bytes": 128,
                    }
                ],
            },
            headers={**AUTH, "Accept": "text/event-stream"},
        )

    assert response.status_code == 200
