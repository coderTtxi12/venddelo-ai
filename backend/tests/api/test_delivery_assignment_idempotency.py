from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import DeliveryDispatchOffer, DeliveryDispatchRequest, DeliveryDriver
from app.main import app
from app.modules.delivery_dispatch.tasks import persist_dispatch_offer
from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_partnerships import COVERED_LAT, COVERED_LNG
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_owner,
    _as_rider,
    _create_and_offer,
    _create_dispatch_request,
    _setup_ready_fleet,
    _setup_ready_rider,
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


@requires_db
def test_accept_offer_twice_keeps_same_driver(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    first = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    second = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "accepted"
    assert second.json()["id"] == offer_id

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, uuid.UUID(request_id))
        assert row is not None
        assert row.status == "assigned"
        assert row.assigned_driver_id == uuid.UUID(driver_id)
        offers = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(
                    DeliveryDispatchOffer.request_id == uuid.UUID(request_id)
                )
            )
        )
        assert len(offers) == 1
        assert offers[0].status == "accepted"
        assert offers[0].driver_id == uuid.UUID(driver_id)


@requires_db
def test_persist_offer_twice_does_not_duplicate_live_offer(client, engine):
    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="idempotent-persist",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    expires_at = datetime.now(UTC) + timedelta(seconds=30)
    with factory() as session:
        request = session.get(DeliveryDispatchRequest, request_id)
        driver_a = session.get(DeliveryDriver, driver_ids[0])
        driver_b = session.get(DeliveryDriver, driver_ids[1])
        assert request is not None and driver_a is not None and driver_b is not None
        first = persist_dispatch_offer(
            session,
            request,
            driver_a,
            case="A",
            high_demand=False,
            group_id=None,
            expires_at=expires_at,
        )
        again = persist_dispatch_offer(
            session,
            request,
            driver_a,
            case="A",
            high_demand=False,
            group_id=None,
            expires_at=expires_at,
        )
        other = persist_dispatch_offer(
            session,
            request,
            driver_b,
            case="A",
            high_demand=False,
            group_id=None,
            expires_at=expires_at,
        )
        session.commit()
        live = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(
                    DeliveryDispatchOffer.request_id == request_id,
                    DeliveryDispatchOffer.status == "offered",
                )
            )
        )
        assert first is not None
        assert again is not None
        assert again.id == first.id
        assert other is None
        assert [row.id for row in live] == [first.id]
        assert live[0].driver_id == driver_ids[0]


@requires_db
def test_second_search_does_not_create_second_offer(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        offers = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(
                    DeliveryDispatchOffer.request_id == request_id
                )
            )
        )
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        assert row.status == "offered"
        assert len(offers) == 1
        assert offers[0].status == "offered"


@requires_db
def test_manual_offer_same_driver_twice_reuses_live_offer(client, engine):
    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="idempotent-manual",
    )
    _claim_riders(client)
    request_id = _create_dispatch_request(client, restaurant_id)

    _as_mexy()
    first = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    second = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[0])},
        headers=AUTH,
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        live = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(
                    DeliveryDispatchOffer.request_id == request_id,
                    DeliveryDispatchOffer.status == "offered",
                )
            )
        )
        assert len(live) == 1
        assert live[0].driver_id == driver_ids[0]
        assert live[0].case_applied == "M"


@requires_db
def test_case_c_accept_does_not_steal_already_assigned_sibling(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="idempotent-case-c",
    )
    _claim_riders(client)
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(
        client,
        restaurant_id,
        dropoff_lat=COVERED_LAT + 0.001,
        dropoff_lng=COVERED_LNG,
    )
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_a)}, now=now)
        session.commit()
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_a,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert offer is not None
        assert row_b is not None
        grouped_driver_id = offer.driver_id
        other_id = next(item for item in driver_ids if item != grouped_driver_id)
        other = session.get(DeliveryDriver, other_id)
        assert other is not None
        persist_dispatch_offer(
            session,
            row_b,
            other,
            case="A",
            high_demand=False,
            group_id=None,
            expires_at=now + timedelta(seconds=30),
        )
        session.commit()
        offer_id = offer.id

    if grouped_driver_id == driver_ids[0]:
        _as_rider_a()
    else:
        _as_rider_b()
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    with factory() as session:
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        sibling_offer = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_b,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert row_a is not None and row_b is not None
        assert row_a.assigned_driver_id == grouped_driver_id
        assert row_b.assigned_driver_id is None
        assert row_b.status == "offered"
        assert sibling_offer is not None
        assert sibling_offer.driver_id == other_id
