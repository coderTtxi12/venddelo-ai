import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import DeliveryDispatchRequest
from tests.api.test_api_v1 import AUTH, OWNER
from tests.api.test_delivery_partnerships import (
    COVERED_LAT,
    COVERED_LNG,
    MEXY_USER,
    _create_mexy_provider,
)
from tests.conftest import requires_db


@pytest.fixture(autouse=True)
def _clean_dispatch_tables(engine):
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


def _create_restaurant(client, *, subdomain: str) -> str:
    response = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Dispatch Bistro",
            "subdomain": subdomain,
            "delivery_enabled": True,
            "latitude": COVERED_LAT,
            "longitude": COVERED_LNG,
        },
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _activate_partnership(client, engine, restaurant_id: str) -> None:
    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth
    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    link_id = next(
        item["id"] for item in listed.json() if item["restaurant"]["id"] == restaurant_id
    )
    accepted = client.post(
        f"/api/v1/delivery-providers/me/partnership-requests/{link_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_provider_schedules
                SET opens_at = TIME '00:00', closes_at = TIME '23:59'
                """
            )
        )
    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)


def _dispatch_payload(**overrides):
    payload = {
        "customer_name": "María López",
        "customer_phone": "+525512345678",
        "dropoff_lat": COVERED_LAT,
        "dropoff_lng": COVERED_LNG,
        "dropoff_address": "Centro Histórico, CDMX",
        "payment_method": "cash",
        "collect_cents": 25000,
        "cash_denomination_cents": 50000,
        "package_size": "normal",
        "package_count": 1,
        "prep_minutes": 5,
    }
    payload.update(overrides)
    return payload


@requires_db
def test_create_requires_active_partnership(client, engine):
    restaurant_id = _create_restaurant(client, subdomain="dispatch-no-partner")

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )

    assert response.status_code == 403
    assert response.json()["error"]["message"] == "No tienes un repartidor activo"


@requires_db
def test_create_dispatch_persists_quote_and_immediate_search(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-active")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "searching"
    assert len(body["tracking_token"]) >= 48
    assert body["quoted_fee_cents"] > 0
    assert body["search_at"] is not None

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.scalar(
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.id == uuid.UUID(body["id"])
            )
        )
        assert row is not None
        assert row.search_at is not None


@requires_db
def test_create_rejects_unconfigured_prep_time(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-bad-prep")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(prep_minutes=7),
        headers=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Ese tiempo de preparación no está configurado"


@requires_db
def test_unknown_tracking_token_returns_404(client):
    response = client.get("/api/v1/public/dispatch-tracking/missing-token")
    assert response.status_code == 404


@requires_db
def test_invalid_maps_url_returns_400(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-bad-maps")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(
            dropoff_lat=None,
            dropoff_lng=None,
            dropoff_maps_url="https://example.com/not-a-map",
        ),
        headers=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "No se pudo leer la ubicación del enlace"


@requires_db
def test_lead_times_and_payment_patch_while_searching(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-patch")
    _activate_partnership(client, engine, restaurant_id)

    lead_times = client.get(
        "/api/v1/restaurants/me/dispatch-lead-times",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert lead_times.status_code == 200
    assert [row["prep_minutes"] for row in lead_times.json()] == [5, 10, 15, 20, 30]

    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]

    patched = client.patch(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}",
        params={"restaurant_id": restaurant_id},
        json={"payment_method": "transfer", "collect_cents": 0},
        headers=AUTH,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["payment_method"] == "transfer"
    assert patched.json()["collect_cents"] == 0
    assert patched.json()["cash_denomination_cents"] is None

    retry = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/retry",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert retry.status_code == 400


@requires_db
def test_cancel_and_public_tracking_hide_private_fields(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-tracking")
    _activate_partnership(client, engine, restaurant_id)
    create_response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()

    cancelled = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{created['id']}/cancel",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    tracking = client.get(f"/api/v1/public/dispatch-tracking/{created['tracking_token']}")
    assert tracking.status_code == 200
    assert tracking.json()["status"] == "cancelled"
    assert tracking.json()["dropoff"]["address"] == "Centro Histórico, CDMX"
    assert "customer_phone" not in tracking.json()
    assert "tracking_token" not in tracking.json()
