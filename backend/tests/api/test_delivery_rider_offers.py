from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import (
    DeliveryCreditHold,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryProviderAssignmentSettings,
)
from app.main import app
from tests.api.test_api_v1 import AUTH, OWNER
from tests.api.test_delivery_drivers import TINY_PNG
from tests.api.test_delivery_partnerships import (
    COVERED_LAT,
    COVERED_LNG,
    MEXY_USER,
    _create_mexy_provider,
)
from tests.api.test_restaurant_dispatch_requests import (
    _activate_partnership,
    _create_restaurant,
    _dispatch_payload,
)
from tests.conftest import requires_db

RIDER = uuid.UUID("44444444-4444-4444-4444-444444444444")
RIDER_EMAIL = "repartidor@empresa.com"


class _Auth(AuthPort):
    def __init__(self, user_id: uuid.UUID, email: str) -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        return AuthenticatedUser(id=self._user_id, email=self._email)


def _as_mexy() -> None:
    app.dependency_overrides[get_auth] = lambda: _Auth(MEXY_USER, "mexy@example.com")


def _as_owner() -> None:
    app.dependency_overrides[get_auth] = lambda: _Auth(OWNER, "test@example.com")


def _as_rider() -> None:
    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER, RIDER_EMAIL)


@pytest.fixture(autouse=True)
def _clean_rider_offer_tables(engine):
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


def _driver_payload(
    *,
    email: str = RIDER_EMAIL,
    phone: str = "+525511112233",
    plate: str = "ABC123",
) -> dict:
    return {
        "first_name": "Juan",
        "last_name": "Pérez",
        "phone": phone,
        "emergency_contact_name": "María Pérez",
        "emergency_contact_phone": "+525598765432",
        "email": email,
        "compartment_size": "normal",
        "plate": plate,
        "motorcycle_brand": "Italika",
        "motorcycle_color": "Rojo",
        "profile_photo_base64": TINY_PNG,
        "profile_photo_file_name": "foto.png",
        "ine_document_base64": TINY_PNG,
        "ine_document_file_name": "ine.png",
        "license_document_base64": TINY_PNG,
        "license_document_file_name": "licencia.png",
        "insurance_document_base64": TINY_PNG,
        "insurance_document_file_name": "seguro.png",
    }


def _setup_ready_rider(client, engine) -> tuple[str, str]:
    _create_mexy_provider(client)
    _as_mexy()
    settings = client.patch(
        "/api/v1/delivery-providers/me/assignment-settings",
        json={"high_demand_available_drivers_max": 0, "min_protected_drivers": 0},
        headers=AUTH,
    )
    assert settings.status_code == 200, settings.text
    created = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    driver_id = created.json()["id"]

    _as_owner()
    restaurant_id = _create_restaurant(client, subdomain="rider-offers")
    _activate_partnership(client, engine, restaurant_id)

    _as_rider()
    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.status_code == 200, me.text
    online = client.patch(
        "/api/v1/rider/me/online",
        json={"is_online": True},
        headers=AUTH,
    )
    assert online.status_code == 200, online.text
    ping = client.post(
        "/api/v1/rider/me/location",
        json={"latitude": COVERED_LAT, "longitude": COVERED_LNG},
        headers=AUTH,
    )
    assert ping.status_code == 204, ping.text
    return restaurant_id, driver_id


def _create_and_offer(client, engine, restaurant_id: str) -> tuple[str, str]:
    _as_owner()
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]

    from app.modules.delivery_dispatch.tasks import stub_bus

    assert any(job.payload.get("request_id") == request_id for job in stub_bus.jobs)

    search = client.post(
        "/api/v1/internal/delivery/tasks",
        json={"kind": "search", "request_id": request_id},
        headers=AUTH,
    )
    assert search.status_code == 204, search.text

    _as_rider()
    offers = client.get("/api/v1/rider/me/offers", headers=AUTH)
    assert offers.status_code == 200, offers.text
    body = offers.json()
    assert len(body) == 1
    return request_id, body[0]["id"]


@requires_db
def test_rider_offer_includes_route_fee_and_distance(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    _request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    offers = client.get("/api/v1/rider/me/offers", headers=AUTH)
    assert offers.status_code == 200, offers.text
    offer = offers.json()[0]
    assert offer["id"] == offer_id
    assert isinstance(offer["quoted_fee_cents"], int)
    assert offer["quoted_fee_cents"] >= 0
    assert offer["dropoff_lat"] is not None
    assert offer["dropoff_lng"] is not None
    assert "restaurant_lat" in offer
    assert "distance_meters" in offer
    assert offer["short_id"]
    assert len(offer["short_id"]) == 5
    assert offer["stops"][0]["dropoff_lat"] == offer["dropoff_lat"]
    assert offer["stops"][0]["dropoff_lng"] == offer["dropoff_lng"]
    assert offer["stops"][0]["short_id"] == offer["short_id"]


def _setup_ready_fleet(
    client,
    engine,
    *,
    driver_count: int,
    min_protected_drivers: int,
    high_demand_available_drivers_max: int,
    subdomain: str,
) -> tuple[str, list[uuid.UUID]]:
    _create_mexy_provider(client)
    _as_mexy()
    settings = client.patch(
        "/api/v1/delivery-providers/me/assignment-settings",
        json={
            "high_demand_available_drivers_max": high_demand_available_drivers_max,
            "min_protected_drivers": min_protected_drivers,
        },
        headers=AUTH,
    )
    assert settings.status_code == 200, settings.text
    driver_ids: list[uuid.UUID] = []
    for index in range(driver_count):
        created = client.post(
            "/api/v1/delivery-providers/me/drivers",
            json=_driver_payload(
                email=f"repartidor{index}@empresa.com",
                phone=f"+5255111122{index:02d}",
                plate=f"ABC{index:03d}",
            ),
            headers=AUTH,
        )
        assert created.status_code == 201, created.text
        driver_ids.append(uuid.UUID(created.json()["id"]))

    _as_owner()
    restaurant_id = _create_restaurant(client, subdomain=subdomain)
    _activate_partnership(client, engine, restaurant_id)

    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        for driver_id in driver_ids:
            driver = session.get(DeliveryDriver, driver_id)
            assert driver is not None
            driver.status = "active"
            driver.is_online = True
            driver.last_lat = COVERED_LAT
            driver.last_lng = COVERED_LNG
            driver.location_updated_at = now
        session.commit()
    return restaurant_id, driver_ids


def _create_dispatch_request(client, restaurant_id: str, **payload_overrides) -> uuid.UUID:
    _as_owner()
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(**payload_overrides),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    return uuid.UUID(created.json()["id"])


@requires_db
def test_accept_cash_creates_hold_and_confirm_releases(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    accepted = client.post(
        f"/api/v1/rider/me/offers/{offer_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200, accepted.text

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.credit_held_cents == 25000
        hold = session.scalar(
            select(DeliveryCreditHold).where(
                DeliveryCreditHold.request_id == uuid.UUID(request_id)
            )
        )
        assert hold is not None
        assert hold.status == "held"
        assert hold.amount_cents == 25000

    _as_owner()
    confirmed = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-rider-cash",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert confirmed.status_code == 200, confirmed.text

    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.credit_held_cents == 0
        hold = session.scalar(
            select(DeliveryCreditHold).where(
                DeliveryCreditHold.request_id == uuid.UUID(request_id)
            )
        )
        assert hold is not None
        assert hold.status == "released"


@requires_db
def test_accept_non_offered_returns_409(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    _request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        offer = session.get(DeliveryDispatchOffer, uuid.UUID(offer_id))
        assert offer is not None
        offer.status = "expired"
        session.commit()

    _as_rider()
    accepted = client.post(
        f"/api/v1/rider/me/offers/{offer_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 409
    assert accepted.json()["error"]["message"] == "La oferta ya no está disponible"


@requires_db
def test_internal_tasks_unauthorized_when_secret_mismatches(client):
    with patch(
        "app.modules.delivery_dispatch.tasks.get_settings",
        return_value=SimpleNamespace(
            delivery_tasks_backend="gcp",
            delivery_tasks_secret="expected-secret",
        ),
    ):
        response = client.post(
            "/api/v1/internal/delivery/tasks",
            json={"kind": "search", "request_id": str(uuid.uuid4())},
            headers={**AUTH, "X-Delivery-Tasks-Secret": "wrong"},
        )
    assert response.status_code == 401


@requires_db
def test_expire_offer_marks_silent_and_offers_next(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="expire-cycle",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert offer is not None
        first_driver_id = offer.driver_id
        offer_id = offer.id

    with factory() as session:
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": str(request_id),
                "offer_id": str(offer_id),
            },
            now=now,
        )
        session.commit()
        expired = session.get(DeliveryDispatchOffer, offer_id)
        request = session.get(DeliveryDispatchRequest, request_id)
        nxt = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert expired is not None
        assert expired.status == "expired"
        assert request is not None
        assert first_driver_id in (request.cycle_silent_driver_ids or [])
        assert nxt is not None
        assert nxt.driver_id != first_driver_id
        assert request.status == "offered"


@requires_db
def test_reject_offer_marks_rejected_and_offers_next(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task, reject_offer_and_search

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="reject-cycle",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert offer is not None
        first_driver_id = offer.driver_id
        offer_id = offer.id

    with factory() as session:
        offer = session.get(DeliveryDispatchOffer, offer_id)
        request = session.get(DeliveryDispatchRequest, request_id)
        assert offer is not None
        assert request is not None
        reject_offer_and_search(session, offer, request, now)
        session.commit()
        rejected = session.get(DeliveryDispatchOffer, offer_id)
        request = session.get(DeliveryDispatchRequest, request_id)
        nxt = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert rejected is not None
        assert rejected.status == "rejected"
        assert request is not None
        assert first_driver_id in (request.cycle_rejected_driver_ids or [])
        assert nxt is not None
        assert nxt.driver_id != first_driver_id
        assert request.status == "offered"


@requires_db
def test_search_holds_provider_settings_lock(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=3,
        min_protected_drivers=2,
        high_demand_available_drivers_max=0,
        subdomain="case-b-lock",
    )
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    session_a = factory()
    session_b = factory()
    try:
        handle_task(session_a, {"kind": "search", "request_id": str(request_a)}, now=now)
        locked_request = session_a.get(DeliveryDispatchRequest, request_a)
        assert locked_request is not None
        provider_id = locked_request.delivery_provider_id

        session_b.execute(text("SET LOCAL lock_timeout = '1s'"))
        with pytest.raises(OperationalError, match="lock timeout"):
            session_b.scalar(
                select(DeliveryProviderAssignmentSettings)
                .where(
                    DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
                )
                .with_for_update()
            )
        session_b.rollback()

        session_a.commit()
        handle_task(session_b, {"kind": "search", "request_id": str(request_b)}, now=now)
        session_b.commit()

        offers = session_b.scalars(
            select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.status == "offered")
        ).all()
        assert len(offers) == 1
    finally:
        session_a.close()
        session_b.close()


@requires_db
def test_search_timeout_marks_request_unassigned(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task, stub_bus

    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    stub_bus.clear()

    with factory() as session:
        request = session.get(DeliveryDispatchRequest, request_id)
        assert request is not None
        request.search_at = now - timedelta(seconds=900)
        request.status = "searching"
        session.commit()

    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        request = session.get(DeliveryDispatchRequest, request_id)
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.request_id == request_id)
        )
        assert request is not None
        assert request.status == "unassigned"
        assert offer is None
        assert not any(job.kind == "retry" for job in stub_bus.jobs)


@requires_db
def test_high_demand_idle_offers_e_not_grouped_c(client, engine):
    from app.modules.delivery_dispatch.notify import set_offer_notifier
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-e-idle",
    )
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(
        client,
        restaurant_id,
        dropoff_lat=COVERED_LAT + 0.001,
        dropoff_lng=COVERED_LNG,
    )
    now = datetime.now(UTC)
    seen: list[str] = []
    set_offer_notifier(lambda driver, offer: seen.append(str(offer.id)))
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, driver_ids[0])
        assert driver is not None
        driver.fcm_token = "test-fcm-token"
        session.commit()

    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_a)}, now=now)
        session.commit()
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_a,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert row_a is not None and row_b is not None
        assert offer is not None
        assert offer.case_applied == "E"
        assert offer.driver_id == driver_ids[0]
        assert row_a.dispatch_group_id is None
        assert row_b.dispatch_group_id is None
        assert row_b.status == "searching"
        assert seen == [str(offer.id)]


@requires_db
def test_case_c_hooks_assigned_rider_same_restaurant(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-hook",
    )
    request_a = _create_dispatch_request(client, restaurant_id)
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
        assert offer is not None
        offer_id = offer.id

    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER, "repartidor0@empresa.com")
    claimed = client.get("/api/v1/rider/me", headers=AUTH)
    assert claimed.status_code == 200, claimed.text
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    request_b = _create_dispatch_request(
        client,
        restaurant_id,
        dropoff_lat=COVERED_LAT + 0.001,
        dropoff_lng=COVERED_LNG,
    )
    later = datetime.now(UTC)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_b)}, now=later)
        session.commit()
        offer_b = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_b,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_a is not None and row_b is not None
        assert row_a.status == "assigned"
        assert offer_b is not None
        assert offer_b.case_applied == "C"
        assert offer_b.driver_id == driver_ids[0]
        assert row_b.dispatch_group_id is None


@requires_db
def test_case_c_accept_assigns_all_grouped_requests(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-accept",
    )
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
        assert offer is not None
        offer_id = offer.id

    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER, "repartidor0@empresa.com")
    claimed = client.get("/api/v1/rider/me", headers=AUTH)
    assert claimed.status_code == 200, claimed.text
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    with factory() as session:
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        driver = session.get(DeliveryDriver, driver_ids[0])
        holds = list(
            session.scalars(
                select(DeliveryCreditHold).where(
                    DeliveryCreditHold.driver_id == driver_ids[0],
                    DeliveryCreditHold.status == "held",
                )
            )
        )
        assert row_a is not None and row_b is not None and driver is not None
        assert row_a.status == "assigned"
        assert row_b.status == "searching"
        assert row_a.assigned_driver_id == driver_ids[0]
        assert row_b.assigned_driver_id is None
        assert {hold.request_id for hold in holds} == {request_a}
        assert driver.credit_held_cents == 25000


@requires_db
def test_case_c_sibling_search_is_noop_while_offer_live(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task, stub_bus

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-sibling-noop",
    )
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
        row_a = session.get(DeliveryDispatchRequest, request_a)
        assert row_a is not None
        stub_bus.clear()
        handle_task(session, {"kind": "search", "request_id": str(request_b)}, now=now)
        session.commit()
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        offers = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.status == "offered")
            )
        )
        assert row_a is not None and row_b is not None
        assert len(offers) == 1
        assert offers[0].request_id == request_a
        assert row_a.status == "offered"
        assert row_b.status == "searching"
        assert row_a.dispatch_group_id is None
        assert row_b.dispatch_group_id is None
        assert not any(job.payload.get("request_id") == str(request_b) for job in stub_bus.jobs)


@requires_db
def test_case_c_expire_clears_dispatch_group(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-expire-group",
    )
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
        assert offer is not None
        offer_id = offer.id

    with factory() as session:
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": str(request_a),
                "offer_id": str(offer_id),
            },
            now=now,
        )
        session.commit()
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_a is not None and row_b is not None
        assert row_a.dispatch_group_id is None
        assert row_b.dispatch_group_id is None


@requires_db
def test_case_c_third_search_does_not_steal_live_group(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-no-steal",
    )
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
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_a is not None and row_b is not None
        assert row_a.status == "offered"
        a_offer_id = session.scalar(
            select(DeliveryDispatchOffer.id).where(
                DeliveryDispatchOffer.request_id == request_a,
                DeliveryDispatchOffer.status == "offered",
            )
        )

    request_c = _create_dispatch_request(
        client,
        restaurant_id,
        dropoff_lat=COVERED_LAT + 0.002,
        dropoff_lng=COVERED_LNG,
    )
    later = datetime.now(UTC)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_c)}, now=later)
        session.commit()
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_c = session.get(DeliveryDispatchRequest, request_c)
        live_a = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.id == a_offer_id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert row_a is not None and row_c is not None
        assert live_a is not None
        assert row_a.status == "offered"
        assert row_c.dispatch_group_id is None


@requires_db
def test_case_c_expire_resumes_sibling_search(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-expire-resume",
    )
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
        assert offer is not None
        offer_id = offer.id
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": str(request_a),
                "offer_id": str(offer_id),
            },
            now=now,
        )
        session.commit()
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_b is not None
        assert row_b.dispatch_group_id is None
        assert row_b.status == "searching"


@requires_db
def test_case_c_cancel_sibling_then_accept_keeps_cancelled(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-cancel-sibling",
    )
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
        assert offer is not None
        offer_id = offer.id
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_a is not None and row_b is not None
        assert row_a.status == "offered"
        assert row_b.status == "searching"

    _as_owner()
    cancelled = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_b}/cancel",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"

    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER, "repartidor0@empresa.com")
    claimed = client.get("/api/v1/rider/me", headers=AUTH)
    assert claimed.status_code == 200, claimed.text
    accepted = client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH)
    assert accepted.status_code == 200, accepted.text

    with factory() as session:
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_a is not None and row_b is not None
        assert row_a.status == "assigned"
        assert row_a.assigned_driver_id == driver_ids[0]
        assert row_b.status == "cancelled"
        assert row_b.assigned_driver_id is None
        assert row_b.dispatch_group_id is None


@requires_db
def test_resume_former_group_members_skips_cancelled_and_live_group(client, engine):
    from app.modules.delivery_dispatch.tasks import (
        _resume_former_group_members,
        handle_task,
        stub_bus,
    )

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-resume-skip",
    )
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
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_a is not None and row_b is not None
        group_id = uuid.uuid4()
        row_a.dispatch_group_id = group_id
        row_b.dispatch_group_id = group_id
        session.commit()

        stub_bus.clear()
        _resume_former_group_members(session, [row_a, row_b], skip_id=row_a.id, now=now)
        assert not any(
            job.payload.get("request_id") == str(request_b) for job in stub_bus.jobs
        )

        row_b.status = "cancelled"
        row_b.search_at = now - timedelta(hours=2)
        stub_bus.clear()
        _resume_former_group_members(session, [row_a, row_b], skip_id=row_a.id, now=now)
        session.flush()
        assert row_b.status == "cancelled"
        assert not any(
            job.payload.get("request_id") == str(request_b) for job in stub_bus.jobs
        )

        offer = session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == request_a,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        assert offer is not None
        row_b.status = "searching"
        row_b.search_at = now - timedelta(hours=2)
        session.flush()
        stub_bus.clear()
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": str(request_a),
                "offer_id": str(offer.id),
            },
            now=now,
        )
        session.commit()
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert row_b is not None
        assert row_b.status == "unassigned"
        assert row_b.dispatch_group_id is None


@requires_db
def test_expire_after_cancel_keeps_request_cancelled(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    request_uuid = uuid.UUID(request_id)
    offer_uuid = uuid.UUID(offer_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        offer = session.get(DeliveryDispatchOffer, offer_uuid)
        assert offer is not None
        offer.expires_at = now - timedelta(seconds=1)
        session.commit()

    _as_owner()
    cancelled = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/cancel",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"

    with factory() as session:
        offer = session.get(DeliveryDispatchOffer, offer_uuid)
        assert offer is not None
        assert offer.status == "expired"

    with factory() as session:
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": request_id,
                "offer_id": offer_id,
            },
            now=now,
        )
        session.commit()
        request = session.get(DeliveryDispatchRequest, request_uuid)
        offer = session.get(DeliveryDispatchOffer, offer_uuid)
        assert request is not None
        assert request.status == "cancelled"
        assert offer is not None
        assert offer.status == "expired"


@requires_db
def test_case_b_one_search_protects_min_drivers(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=3,
        min_protected_drivers=2,
        high_demand_available_drivers_max=0,
        subdomain="case-b-protect",
    )
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_a)}, now=now)
        session.commit()
        offers = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.status == "offered")
            ).all()
        )
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert len(offers) == 1
        assert row_a is not None and row_b is not None
        offered_ids = {offer.request_id for offer in offers}
        assert offered_ids == {request_a}
        assert row_a.status == "offered"
        assert row_b.status != "offered"


@requires_db
def test_case_b_persists_sibling_offers_from_engine(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=4,
        min_protected_drivers=2,
        high_demand_available_drivers_max=0,
        subdomain="case-b-siblings",
    )
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_a)}, now=now)
        session.commit()
        offers = list(
            session.scalars(
                select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.status == "offered")
            ).all()
        )
        row_a = session.get(DeliveryDispatchRequest, request_a)
        row_b = session.get(DeliveryDispatchRequest, request_b)
        assert len(offers) == 2
        assert {offer.request_id for offer in offers} == {request_a, request_b}
        assert {offer.case_applied for offer in offers} == {"B"}
        assert len({offer.driver_id for offer in offers}) == 2
        assert row_a is not None and row_b is not None
        assert row_a.status == "offered"
        assert row_b.status == "offered"


@requires_db
def test_release_hold_locks_driver_row(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    accepted = client.post(
        f"/api/v1/rider/me/offers/{offer_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200, accepted.text

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    session_a = factory()
    session_b = factory()
    try:
        locked = session_a.scalar(
            select(DeliveryDriver)
            .where(DeliveryDriver.id == uuid.UUID(driver_id))
            .with_for_update()
        )
        assert locked is not None

        from app.modules.delivery_dispatch.service import RestaurantDispatchService

        session_b.execute(text("SET LOCAL lock_timeout = '1s'"))
        service = RestaurantDispatchService(session_b, provider_repo=None)
        row = session_b.get(DeliveryDispatchRequest, uuid.UUID(request_id))
        assert row is not None
        with pytest.raises(OperationalError, match="lock timeout"):
            service._release_hold(row, released_by_user_id=None, now=datetime.now(UTC))
        session_b.rollback()
    finally:
        session_a.rollback()
        session_a.close()
        session_b.close()


@requires_db
def test_case_c_offer_lists_grouped_stops(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-stops",
    )
    request_a = _create_dispatch_request(client, restaurant_id)
    request_b = _create_dispatch_request(
        client,
        restaurant_id,
        dropoff_lat=COVERED_LAT + 0.001,
        dropoff_lng=COVERED_LNG,
        dropoff_address="Roma Norte, CDMX",
    )
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_a)}, now=now)
        session.commit()

    app.dependency_overrides[get_auth] = lambda: _Auth(RIDER, "repartidor0@empresa.com")
    claimed = client.get("/api/v1/rider/me", headers=AUTH)
    assert claimed.status_code == 200, claimed.text
    offers = client.get("/api/v1/rider/me/offers", headers=AUTH)
    assert offers.status_code == 200, offers.text
    body = offers.json()
    assert len(body) == 1
    stops = body[0]["stops"]
    addresses = {stop["dropoff_address"] for stop in stops}
    assert addresses == {"Centro Histórico, CDMX"}
    assert all(stop["restaurant_name"] == "Dispatch Bistro" for stop in stops)
    assert body[0]["package_count"] == 1
