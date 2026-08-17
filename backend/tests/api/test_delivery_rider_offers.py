from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import DeliveryCreditHold, DeliveryDispatchOffer, DeliveryDriver
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
    from app.modules.delivery_dispatch.tasks import stub_bus

    stub_bus.clear()
    _as_owner()


def _driver_payload() -> dict:
    return {
        "first_name": "Juan",
        "last_name": "Pérez",
        "phone": "+525511112233",
        "email": RIDER_EMAIL,
        "compartment_size": "normal",
        "plate": "ABC123",
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
