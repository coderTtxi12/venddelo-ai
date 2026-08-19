from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import DeliveryDispatchRequest
from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_owner,
    _as_rider,
    _create_and_offer,
    _driver_payload,
    _setup_ready_rider,
)
from tests.conftest import requires_db


@pytest.fixture(autouse=True)
def _clean(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_credit_holds, delivery_dispatch_offers,
                         delivery_dispatch_requests, delivery_drivers,
                         restaurant_delivery_providers,
                         delivery_search_lead_times,
                         delivery_provider_assignment_settings,
                         delivery_provider_pricing_configs,
                         delivery_provider_payment_methods,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers,
                         restaurant_members, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield
    from app.modules.delivery_dispatch.notify import set_offer_notifier
    from app.modules.delivery_dispatch.tasks import stub_bus

    stub_bus.clear()
    set_offer_notifier(None)
    _as_owner()


def _accept_and_deliver(client, engine, restaurant_id: str) -> str:
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    _as_rider()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200
    assert client.post(
        f"/api/v1/rider/me/assignments/{request_id}/picked-up", headers=AUTH
    ).status_code == 200
    assert client.post(
        f"/api/v1/rider/me/assignments/{request_id}/in-transit", headers=AUTH
    ).status_code == 200
    delivered = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/delivered", headers=AUTH
    )
    assert delivered.status_code == 200, delivered.text
    return request_id


@requires_db
def test_delivered_leaves_me_and_appears_in_history(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)

    _as_rider()
    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.json()["assignments"] == []

    history = client.get("/api/v1/rider/me/history", headers=AUTH)
    assert history.status_code == 200, history.text
    body = history.json()
    assert [row["id"] for row in body["items"]] == [request_id]
    assert body["items"][0]["status"] == "delivered"
    assert body["items"][0]["closed_at"]
    assert body["delivered_count"] == 1
    assert body["cancelled_count"] == 0
    assert body["earnings_cents"] == body["items"][0]["quoted_fee_cents"]
    assert "driver_id" not in body
    assert body["has_more"] is False


@requires_db
def test_rider_history_includes_own_cancelled_not_others(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    _as_rider()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200
    _as_owner()
    cancel = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/cancel",
        headers=AUTH,
    )
    assert cancel.status_code == 200, cancel.text

    _as_mexy()
    other_driver = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_payload(email="otro@empresa.com", plate="XYZ999"),
        headers=AUTH,
    )
    assert other_driver.status_code == 201, other_driver.text
    other_driver_id = uuid.UUID(other_driver.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, uuid.UUID(request_id))
        assert row is not None
        clone = DeliveryDispatchRequest(
            restaurant_id=row.restaurant_id,
            delivery_provider_id=row.delivery_provider_id,
            zone_id=row.zone_id,
            customer_name="Otro",
            customer_phone="+525500000000",
            dropoff_lat=row.dropoff_lat,
            dropoff_lng=row.dropoff_lng,
            dropoff_address=row.dropoff_address,
            payment_method=row.payment_method,
            collect_cents=row.collect_cents,
            cash_denomination_cents=row.cash_denomination_cents,
            package_size=row.package_size,
            package_count=row.package_count,
            ready_at=row.ready_at,
            search_at=row.search_at,
            next_attempt_at=row.next_attempt_at,
            quoted_fee_cents=row.quoted_fee_cents,
            status="cancelled",
            assigned_driver_id=other_driver_id,
            tracking_token="histtok1" + "a" * 40,
            short_id="ZZZZ1",
            cancelled_at=datetime.now(UTC),
        )
        session.add(clone)
        session.flush()
        foreign_id = str(clone.id)
        session.commit()

    _as_rider()
    history = client.get("/api/v1/rider/me/history", headers=AUTH)
    assert history.status_code == 200, history.text
    ids = {row["id"] for row in history.json()["items"]}
    assert request_id in ids
    assert foreign_id not in ids
    assert history.json()["cancelled_count"] == 1
    assert history.json()["earnings_cents"] == 0


@requires_db
def test_rider_history_earnings_ignore_cancelled_and_paginate(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    first = _accept_and_deliver(client, engine, restaurant_id)
    second = _accept_and_deliver(client, engine, restaurant_id)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    _as_rider()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200
    _as_owner()
    assert client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/cancel",
        headers=AUTH,
    ).status_code == 200

    _as_rider()
    page = client.get("/api/v1/rider/me/history", params={"limit": 1}, headers=AUTH)
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["has_more"] is True
    assert len(body["items"]) == 1
    assert body["total"] == 3
    assert body["delivered_count"] == 2
    assert body["cancelled_count"] == 1
    full = client.get(
        "/api/v1/rider/me/history", params={"limit": 100}, headers=AUTH
    )
    fees = [
        item["quoted_fee_cents"]
        for item in full.json()["items"]
        if item["id"] in {first, second}
    ]
    assert body["earnings_cents"] == sum(fees)


@requires_db
def test_rider_history_excludes_yesterday_when_asking_today(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)
    yesterday = datetime.now(UTC) - timedelta(days=1)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE delivery_dispatch_requests SET updated_at = :ts WHERE id = :id"),
            {"ts": yesterday, "id": request_id},
        )

    _as_rider()
    from app.modules.delivery_dispatch.history import today_mexico

    today = today_mexico().isoformat()
    history = client.get(
        "/api/v1/rider/me/history",
        params={"start": today, "end": today},
        headers=AUTH,
    )
    assert history.status_code == 200
    assert history.json()["items"] == []


@requires_db
def test_provider_history_lists_company_rows_and_filters_driver(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)

    _as_mexy()
    listed = client.get("/api/v1/delivery-providers/me/dispatch-history", headers=AUTH)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert [row["id"] for row in body["items"]] == [request_id]
    assert body["items"][0]["assigned_driver_id"] == driver_id
    assert body["items"][0]["assigned_driver_name"]
    assert body["items"][0]["zone_id"]
    assert "dropoff_lat" in body["items"][0]
    kinds = [event["kind"] for event in body["items"][0]["timeline"]]
    assert "requested" in kinds
    assert "accepted" in kinds
    assert "delivered" in kinds
    assert any(event["current"] for event in body["items"][0]["timeline"])

    other = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"driver_id": str(uuid.uuid4())},
        headers=AUTH,
    )
    assert other.status_code == 200
    assert other.json()["items"] == []


@requires_db
def test_provider_history_filters_restaurant(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)

    _as_mexy()
    matched = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert matched.status_code == 200, matched.text
    assert [row["id"] for row in matched.json()["items"]] == [request_id]
    assert matched.json()["items"][0]["restaurant_id"] == restaurant_id

    empty = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"restaurant_id": str(uuid.uuid4())},
        headers=AUTH,
    )
    assert empty.status_code == 200
    assert empty.json()["items"] == []


@requires_db
def test_provider_history_zone_filter_and_non_member(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)
    _as_mexy()
    full = client.get("/api/v1/delivery-providers/me/dispatch-history", headers=AUTH)
    zone_id = full.json()["items"][0]["zone_id"]
    filtered = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"zone_id": zone_id},
        headers=AUTH,
    )
    assert [row["id"] for row in filtered.json()["items"]] == [request_id]
    empty = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"zone_id": str(uuid.uuid4())},
        headers=AUTH,
    )
    assert empty.json()["items"] == []

    _as_owner()
    denied = client.get("/api/v1/delivery-providers/me/dispatch-history", headers=AUTH)
    assert denied.status_code in {403, 404}
