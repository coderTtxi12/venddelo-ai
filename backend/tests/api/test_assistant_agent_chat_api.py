import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.core.llm.ports import ChatStreamEvent
from app.core.security import AuthenticatedUser
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.assistant.api import assistant_chat
from app.modules.assistant.schemas import AssistantChatRequest
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


def test_assistant_chat_closes_request_uow_before_streaming():
    call_order: list[str] = []
    restaurant_id = uuid.uuid4()
    user = AuthenticatedUser(id=uuid.uuid4(), email="owner@test.com")

    class TrackingUow:
        def __init__(self) -> None:
            self.restaurants = SimpleNamespace(
                get=lambda _id: SimpleNamespace(id=restaurant_id, owner_id=user.id),
                get_for_user=lambda *_args, **_kwargs: None,
            )

        def commit(self) -> None:
            call_order.append("uow_commit")

    def fake_get_uow():
        call_order.append("uow_enter")
        try:
            yield TrackingUow()
            call_order.append("uow_commit")
        finally:
            call_order.append("uow_exit")

    request = SimpleNamespace(app=SimpleNamespace(dependency_overrides={get_uow: fake_get_uow}))

    class FakeService:
        def _require_openai_api_key(self):
            return None

        async def stream_chat(self, **kwargs):
            call_order.append("stream")
            assert kwargs.get("uow") is None
            yield ChatStreamEvent(event="content.delta", data={"delta": "Hola"})

        @staticmethod
        def format_sse(event):
            return f"event: {event.event}\n\n"

    async def run_request():
        response = await assistant_chat(
            request=request,
            restaurant_id=restaurant_id,
            body=AssistantChatRequest(message="Hola"),
            user=user,
            service=FakeService(),
        )
        async for _chunk in response.body_iterator:
            pass

    asyncio.run(run_request())

    assert "uow_exit" in call_order
    assert "stream" in call_order
    assert call_order.index("uow_exit") < call_order.index("stream")


@requires_db
def test_assistant_chat_streams_agent_reply(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-agent-chat")
    conversation_id = uuid.uuid4()

    with (
        patch(
            "app.modules.assistant.api.AssistantAgentService._require_openai_api_key",
            return_value=None,
        ),
        patch(
            "app.modules.assistant.api.AssistantAgentService.stream_chat",
            side_effect=_fake_stream_chat,
        ),
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

    with (
        patch(
            "app.modules.assistant.api.AssistantAgentService._require_openai_api_key",
            return_value=None,
        ),
        patch(
            "app.modules.assistant.api.AssistantAgentService.stream_chat",
            side_effect=_fake_stream_chat,
        ),
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
