"""History board list filters, total, and summary.delivery."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import sessionmaker

from app.db.models.orders import Order
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.orders.schemas import OrderCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


def _seed(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="History list", subdomain=subdomain),
            owner_id=OWNER,
        )
        rid = restaurant.id
        a = uow.orders.add(
            OrderCreate(
                restaurant_id=rid,
                type="delivery",
                customer_name="María López",
                customer_phone="5511111111",
                payment_method="cash",
                subtotal_cents=8000,
                total_cents=8000,
                status="delivered",
                items=[],
            )
        )
        b = uow.orders.add(
            OrderCreate(
                restaurant_id=rid,
                type="takeout",
                customer_name="Luis Pérez",
                customer_phone="5522222222",
                payment_method="transfer",
                subtotal_cents=3000,
                total_cents=3000,
                status="cancelled",
                items=[],
            )
        )
        c = uow.orders.add(
            OrderCreate(
                restaurant_id=rid,
                type="takeout",
                customer_name="Ana",
                customer_phone="5533333333",
                payment_method="card_terminal",
                subtotal_cents=5000,
                total_cents=5000,
                status="pending",
                items=[],
            )
        )
        delivered_id = a.id
        cancelled_id = b.id
        pending_id = c.id
        uow.commit()

    with factory() as session:
        delivered = session.get(Order, delivered_id)
        cancelled = session.get(Order, cancelled_id)
        assert delivered is not None and cancelled is not None
        delivered.created_at = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
        cancelled.created_at = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
        session.commit()

    return rid, delivered_id, cancelled_id, pending_id


@requires_db
def test_history_list_returns_total_and_excludes_active(client, engine):
    rid, delivered_id, cancelled_id, pending_id = _seed(engine, "hist-total-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders",
        params={"board": "history", "limit": 20},
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    ids = {item["id"] for item in body["items"]}
    assert str(delivered_id) in ids
    assert str(cancelled_id) in ids
    assert str(pending_id) not in ids


@requires_db
def test_history_filters_q_type_payment_status(client, engine):
    rid, delivered_id, _cancelled_id, _pending_id = _seed(engine, "hist-filters-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders",
        params={
            "board": "history",
            "q": "maría",
            "type": "delivery",
            "payment_method": "cash",
            "status": "delivered",
        },
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(delivered_id)


@requires_db
def test_history_summary_includes_delivery_count(client, engine):
    rid, *_ = _seed(engine, "hist-summary-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders/summary",
        params={"board": "history"},
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert body["delivered"] == 1
    assert body["cancelled"] == 1
    assert body["delivery"] == 1


@requires_db
def test_history_date_range_and_sort_total(client, engine):
    rid, _delivered_id, cancelled_id, _pending_id = _seed(engine, "hist-sort-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders",
        params={
            "board": "history",
            "from": "2026-09-01",
            "to": "2026-09-30",
            "sort": "total_cents",
            "order": "asc",
        },
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(cancelled_id)
    assert body["items"][0]["total_cents"] == 3000
