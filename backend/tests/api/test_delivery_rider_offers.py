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
    assert ping.status_code == 200, ping.text
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
def test_case_c_persists_dispatch_group_id_and_notifies(client, engine):
    from app.modules.delivery_dispatch.notify import set_offer_notifier
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=2,
        subdomain="case-c-group",
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
        assert offer.case_applied == "C"
        assert offer.driver_id == driver_ids[0]
        assert row_a.dispatch_group_id is not None
        assert row_a.dispatch_group_id == row_b.dispatch_group_id
        assert seen == [str(offer.id)]
