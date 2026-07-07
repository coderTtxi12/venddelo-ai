"""Public order creation publishes kitchen realtime events."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.realtime import order_hub as order_hub_module
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import PaymentMethodCreate, RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_create_public_publishes_order_created_event(client, engine, monkeypatch):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    published: list[dict] = []

    def capture_publish(restaurant_id, payload):
        published.append({"restaurant_id": restaurant_id, **payload})

    monkeypatch.setattr(
        order_hub_module.get_order_realtime_hub(),
        "publish_sync",
        capture_publish,
    )

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    subdomain = "kitchen-publish"

    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(
                name="Pub",
                subdomain=subdomain,
                status="published",
                takeout_enabled=True,
            ),
            owner_id=OWNER,
        )
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [PaymentMethodCreate(method="cash", service_type="takeout")],
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Menu"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Taco",
                price_cents=5000,
                status="active",
                category_ids=[cat.id],
            )
        )
        product_id = product.id
        uow.commit()

    resp = client.post(
        f"/api/v1/public/menu/{subdomain}/orders",
        json={
            "type": "takeout",
            "customer_name": "Luis",
            "customer_phone": "whatsapp",
            "payment_method": "cash",
            "items": [{"product_id": str(product_id), "quantity": 1}],
        },
    )
    assert resp.status_code == 201, resp.text
    assert published
    assert published[0]["type"] == "order.created"
    assert published[0]["order"]["customer_name"] == "Luis"
