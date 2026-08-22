"""Kitchen board clear and bulk status updates."""

from __future__ import annotations

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.realtime import order_hub as order_hub_module
from app.modules.orders.schemas import OrderCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


def _restaurant_with_orders(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Kitchen board", subdomain=subdomain),
            owner_id=OWNER,
        )
        pending = uow.orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type="takeout",
                customer_name="Ana",
                customer_phone="555",
                payment_method="cash",
                subtotal_cents=5000,
                total_cents=5000,
                status="pending",
                items=[],
            )
        )
        delivered = uow.orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type="takeout",
                customer_name="Luis",
                customer_phone="555",
                payment_method="cash",
                subtotal_cents=5000,
                total_cents=5000,
                status="delivered",
                items=[],
            )
        )
        confirmed = uow.orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type="takeout",
                customer_name="Mia",
                customer_phone="555",
                payment_method="cash",
                subtotal_cents=5000,
                total_cents=5000,
                status="confirmed",
                items=[],
            )
        )
        restaurant_id = restaurant.id
        pending_id = pending.id
        delivered_id = delivered.id
        confirmed_id = confirmed.id
        uow.commit()
    return restaurant_id, pending_id, delivered_id, confirmed_id


@requires_db
def test_clear_closed_orders_hides_them_from_kitchen_not_history(client, engine, monkeypatch):
    restaurant_id, pending_id, delivered_id, _confirmed_id = _restaurant_with_orders(
        engine, "kds-clear-1"
    )
    published: list[dict] = []
    monkeypatch.setattr(
        order_hub_module.get_order_realtime_hub(),
        "publish_sync",
        lambda restaurant_id, payload: published.append({"restaurant_id": restaurant_id, **payload}),
    )

    clear = client.post(
        f"/api/v1/restaurants/{restaurant_id}/orders/kds-clear",
        headers=AUTH,
    )
    assert clear.status_code == 200, clear.text
    assert clear.json()["cleared_count"] == 1
    assert published[-1]["type"] == "kitchen.board_cleared"

    kitchen = client.get(f"/api/v1/restaurants/{restaurant_id}/orders", headers=AUTH)
    history = client.get(
        f"/api/v1/restaurants/{restaurant_id}/orders",
        params={"board": "history"},
        headers=AUTH,
    )
    kitchen_ids = {item["id"] for item in kitchen.json()["items"]}
    history_ids = {item["id"] for item in history.json()["items"]}
    assert str(pending_id) in kitchen_ids
    assert str(delivered_id) not in kitchen_ids
    assert str(delivered_id) in history_ids


@requires_db
def test_bulk_status_advances_selected_orders(client, engine):
    restaurant_id, _pending_id, _delivered_id, confirmed_id = _restaurant_with_orders(
        engine, "kds-bulk-1"
    )
    resp = client.post(
        f"/api/v1/restaurants/{restaurant_id}/orders/bulk-status",
        json={"order_ids": [str(confirmed_id)], "status": "preparing"},
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["updated_count"] == 1
    assert body["items"][0]["status"] == "preparing"
