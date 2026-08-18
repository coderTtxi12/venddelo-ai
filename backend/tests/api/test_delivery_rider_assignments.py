from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import DeliveryDriver
from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_rider_offers import (
    _as_owner,
    _as_rider,
    _create_and_offer,
    _setup_ready_rider,
)
from tests.conftest import requires_db


@pytest.fixture(autouse=True)
def _clean_rider_assignment_tables(engine):
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


@requires_db
def test_live_offer_includes_request_details_for_fullscreen_ui(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    offers = client.get("/api/v1/rider/me/offers", headers=AUTH)
    assert offers.status_code == 200, offers.text
    body = offers.json()
    assert len(body) == 1
    offer = body[0]
    assert offer["restaurant_name"] == "Dispatch Bistro"
    assert offer["dropoff_address"] == "Centro Histórico, CDMX"
    assert offer["collect_cents"] == 25000
    assert offer["payment_method"] == "cash"
    assert offer["package_count"] == 1
    assert offer["expires_at"]


@requires_db
def test_get_me_includes_active_assignments_after_accept(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.status_code == 200, me.text
    assignments = me.json()["assignments"]
    assert len(assignments) == 1
    assignment = assignments[0]
    assert assignment["id"] == request_id
    assert assignment["status"] == "assigned"
    assert assignment["short_id"]
    assert len(assignment["short_id"]) == 5
    assert assignment["restaurant_name"] == "Dispatch Bistro"
    assert assignment["dropoff_address"] == "Centro Histórico, CDMX"
    assert "restaurant_address" in assignment
    assert assignment["dropoff_lat"] is not None
    assert assignment["dropoff_lng"] is not None
    assert assignment["payment_method"] == "cash"
    assert assignment["collect_cents"] == 25000
    assert assignment["cash_denomination_cents"] == 50000
    assert assignment["package_count"] == 1
    assert assignment["package_size"] == "normal"
    assert isinstance(assignment["quoted_fee_cents"], int)
    assert "notes" in assignment
    assert assignment.get("customer_name") in (None, "")
    assert assignment.get("customer_phone") in (None, "")


@requires_db
def test_put_fcm_token_persists_on_driver(client, engine):
    _restaurant_id, driver_id = _setup_ready_rider(client, engine)

    _as_rider()
    response = client.put(
        "/api/v1/rider/me/fcm-token",
        json={"fcm_token": "fcm-token-abc"},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.fcm_token == "fcm-token-abc"


@requires_db
def test_assignment_status_flow_picked_up_in_transit_delivered(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    picked_up = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/picked-up",
        headers=AUTH,
    )
    assert picked_up.status_code == 200, picked_up.text
    assert picked_up.json()["status"] == "picked_up"
    assert picked_up.json()["customer_name"] == "María López"
    assert picked_up.json()["customer_phone"] == "+525512345678"

    me_picked = client.get("/api/v1/rider/me", headers=AUTH)
    assert me_picked.status_code == 200, me_picked.text
    picked_assignment = me_picked.json()["assignments"][0]
    assert picked_assignment["customer_name"] == "María López"
    assert picked_assignment["customer_phone"] == "+525512345678"

    in_transit = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/in-transit",
        headers=AUTH,
    )
    assert in_transit.status_code == 200, in_transit.text
    assert in_transit.json()["status"] == "in_transit"

    delivered = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/delivered",
        headers=AUTH,
    )
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["status"] == "delivered"

    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.status_code == 200, me.text
    assert me.json()["assignments"] == []


@requires_db
def test_wrong_assignment_status_returns_409_spanish(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    in_transit = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/in-transit",
        headers=AUTH,
    )
    assert in_transit.status_code == 409
    assert in_transit.json()["error"]["message"] == "No puedes cambiar el estado de este envío"


@requires_db
def test_foreign_or_missing_assignment_returns_404(client, engine):
    _setup_ready_rider(client, engine)
    missing_id = uuid.uuid4()

    _as_rider()
    response = client.post(
        f"/api/v1/rider/me/assignments/{missing_id}/picked-up",
        headers=AUTH,
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
