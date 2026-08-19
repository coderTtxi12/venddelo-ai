from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import (
    DeliveryCreditHold,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryDriver,
)
from app.main import app
from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_owner,
    _create_dispatch_request,
    _setup_ready_fleet,
)
from tests.conftest import requires_db

RIDER_A = uuid.UUID("44444444-4444-4444-4444-444444444444")
RIDER_A_EMAIL = "repartidor0@empresa.com"
RIDER_B = uuid.UUID("55555555-5555-5555-5555-555555555555")
RIDER_B_EMAIL = "repartidor1@empresa.com"


class _Auth(AuthPort):
    def __init__(self, user_id: uuid.UUID, email: str) -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        return AuthenticatedUser(id=self._user_id, email=self._email)


def _as_rider_a() -> None:
    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER_A, RIDER_A_EMAIL)


def _as_rider_b() -> None:
    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER_B, RIDER_B_EMAIL)


def _claim_riders(client) -> None:
    _as_rider_a()
    me_a = client.get("/api/v1/rider/me", headers=AUTH)
    assert me_a.status_code == 200, me_a.text
    _as_rider_b()
    me_b = client.get("/api/v1/rider/me", headers=AUTH)
    assert me_b.status_code == 200, me_b.text


@pytest.fixture(autouse=True)
def _clean_tables(engine):
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


def _fleet(client, engine, subdomain: str) -> tuple[str, list[uuid.UUID]]:
    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain=subdomain,
    )
    _claim_riders(client)
    return restaurant_id, driver_ids


@requires_db
def test_manual_offer_unassigned_accept_keeps_tracking_token(client, engine):
    restaurant_id, driver_ids = _fleet(client, engine, "manual-unassigned")
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        token = row.tracking_token
        row.status = "unassigned"
        session.commit()

    _as_mexy()
    offered = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert offered.status_code == 201, offered.text
    body = offered.json()
    assert body["case_applied"] == "M"
    assert body["tracking_token"] == token
    offer_id = body["id"]

    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        assert row.status == "offered"
        assert row.assigned_driver_id is None
        assert row.tracking_token == token

    _as_rider_a()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        assert row.status == "assigned"
        assert row.assigned_driver_id == driver_ids[0]
        assert row.tracking_token == token
        hold = session.scalar(
            select(DeliveryCreditHold).where(DeliveryCreditHold.request_id == request_id)
        )
        assert hold is not None
        assert hold.status == "held"
        assert hold.driver_id == driver_ids[0]


@requires_db
def test_manual_reassign_keeps_current_rider_until_accept(client, engine):
    restaurant_id, driver_ids = _fleet(client, engine, "manual-reassign")
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        second_driver = session.get(DeliveryDriver, driver_ids[1])
        assert second_driver is not None
        second_driver.first_name = "Pedro"
        session.commit()

    _as_mexy()
    first = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert first.status_code == 201, first.text
    _as_rider_a()
    accepted = client.post(
        f"/api/v1/rider/me/offers/{first.json()['id']}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200, accepted.text

    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        token = row.tracking_token
        first_held = session.scalar(
            select(DeliveryCreditHold).where(DeliveryCreditHold.request_id == request_id)
        )
        assert first_held is not None
        assert first_held.driver_id == driver_ids[0]

    _as_mexy()
    second = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[1])},
        headers=AUTH,
    )
    assert second.status_code == 201, second.text
    assert second.json()["tracking_token"] == token

    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        assert row.status == "assigned"
        assert row.assigned_driver_id == driver_ids[0]
        assert row.tracking_token == token

    tracking = client.get(f"/api/v1/public/dispatch-tracking/{token}")
    assert tracking.status_code == 200, tracking.text
    rider = tracking.json()["rider"]
    assert rider["first_name"] == "Juan"
    assert rider["plate_suffix"] == "000"
    assert rider["vehicle_type"] == "moto"
    assert rider["motorcycle_brand"] == "Italika"
    assert rider["motorcycle_color"] == "Rojo"
    assert rider["photo_url"]
    assert isinstance(rider["photo_url"], str)
    assert rider["phone"].startswith("+52")
    assert "plate" not in rider
    assert "last_name" not in rider
    assert "emergency_contact_phone" not in rider
    assert rider["latitude"] is not None
    assert rider["longitude"] is not None
    pickup = tracking.json()["pickup"]
    assert pickup["name"] == "Dispatch Bistro"
    assert pickup["latitude"] is not None
    assert tracking.json()["restaurant_name"] == "Dispatch Bistro"
    assert tracking.json()["customer_name"] == "María López"
    assert tracking.json()["package_count"] == 1
    assert tracking.json()["payment_method"] == "cash"
    assert tracking.json()["collect_cents"] == 25000
    assert tracking.json()["cash_denomination_cents"] == 50000

    _as_rider_b()
    swapped = client.post(
        f"/api/v1/rider/me/offers/{second.json()['id']}/accept",
        headers=AUTH,
    )
    assert swapped.status_code == 200, swapped.text

    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        assert row.status == "assigned"
        assert row.assigned_driver_id == driver_ids[1]
        assert row.tracking_token == token
        hold = session.scalar(
            select(DeliveryCreditHold).where(DeliveryCreditHold.request_id == request_id)
        )
        assert hold is not None
        assert hold.status == "held"
        assert hold.driver_id == driver_ids[1]
        previous = session.get(DeliveryDriver, driver_ids[0])
        nxt = session.get(DeliveryDriver, driver_ids[1])
        assert previous is not None
        assert nxt is not None
        assert previous.credit_held_cents == 0
        assert nxt.credit_held_cents == row.collect_cents

    tracking = client.get(f"/api/v1/public/dispatch-tracking/{token}")
    assert tracking.status_code == 200
    swapped_rider = tracking.json()["rider"]
    assert swapped_rider["first_name"] == "Pedro"
    assert swapped_rider["plate_suffix"] == "001"
    assert swapped_rider["vehicle_type"] == "moto"
    assert swapped_rider["phone"].startswith("+52")
    assert "plate" not in swapped_rider
    assert "last_name" not in swapped_rider
    assert "emergency_contact_phone" not in swapped_rider


@requires_db
def test_manual_offer_expire_on_assigned_leaves_rider(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_expire_offer

    restaurant_id, driver_ids = _fleet(client, engine, "manual-expire")
    request_id = _create_dispatch_request(client, restaurant_id)
    _as_mexy()
    first = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert first.status_code == 201, first.text
    _as_rider_a()
    assert (
        client.post(
            f"/api/v1/rider/me/offers/{first.json()['id']}/accept",
            headers=AUTH,
        ).status_code
        == 200
    )

    _as_mexy()
    second = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[1])},
        headers=AUTH,
    )
    assert second.status_code == 201, second.text
    offer_id = uuid.UUID(second.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_expire_offer(session, offer_id, datetime.now(UTC))
        session.commit()
        row = session.get(DeliveryDispatchRequest, request_id)
        offer = session.get(DeliveryDispatchOffer, offer_id)
        assert row is not None
        assert offer is not None
        assert offer.status == "expired"
        assert row.status == "assigned"
        assert row.assigned_driver_id == driver_ids[0]


@requires_db
def test_manual_offer_rejects_busy_driver(client, engine):
    restaurant_id, driver_ids = _fleet(client, engine, "manual-busy")
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(client, restaurant_id)
    _as_mexy()
    first = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_a}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert first.status_code == 201, first.text
    busy = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_b}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert busy.status_code == 409
    same = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_a}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert same.status_code == 201, same.text


@requires_db
def test_provider_retry_restarts_search_like_restaurant(client, engine):
    from app.modules.delivery_dispatch.tasks import stub_bus

    restaurant_id, _driver_ids = _fleet(client, engine, "provider-retry")
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        row.status = "unassigned"
        session.commit()

    stub_bus.clear()
    _as_mexy()
    retried = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/retry",
        headers=AUTH,
    )
    assert retried.status_code == 200, retried.text
    body = retried.json()
    assert body["id"] == str(request_id)
    assert body["status"] == "searching"
    assert any(
        job.kind == "search" and job.payload.get("request_id") == str(request_id)
        for job in stub_bus.jobs
    )

    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        assert row.status == "searching"
        assert row.cycle_rejected_driver_ids == []
        assert row.cycle_silent_driver_ids == []

    again = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/retry",
        headers=AUTH,
    )
    assert again.status_code == 400
    assert again.json()["error"]["message"] == "Solo puedes reintentar solicitudes sin asignar"
