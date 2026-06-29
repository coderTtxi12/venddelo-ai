from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.api.test_assistant_conversations_api import _parse_sse
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_menu_read_chat_emits_tool_events(client, engine):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Assistant Menu Read", subdomain="assistant-menu-read"),
            owner_id=OWNER,
        )
        category = uow.menu.add_category(CategoryCreate(restaurant_id=restaurant.id, name="Tacos"))
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Taco al pastor",
                description="Con piña",
                price_cents=1200,
                category_ids=[category.id],
            )
        )
        uow.commit()

    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    ).json()
    updated = client.patch(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
        json={"display_name": "Luna", "expected_version": profile["version"]},
    ).json()
    conversation = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    ).json()

    with patch("app.modules.assistant.api.build_llm_provider", return_value=StubLLMProvider()):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/conversations/{conversation['id']}/chat",
            headers={**AUTH, "Accept": "text/event-stream"},
            json={
                "message": "Busca productos pastor en mi menú",
                "profile_version": updated["version"],
            },
        )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    names = [name for name, _ in events]
    assert "tool.start" in names
    assert "tool.result" in names
    assert events[-1][0] == "message.complete"
