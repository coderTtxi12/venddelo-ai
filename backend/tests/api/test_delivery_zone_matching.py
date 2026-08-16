import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import DeliveryProviderZone, RestaurantDeliveryProvider
from tests.api.test_api_v1 import AUTH, OWNER
from tests.api.test_delivery_partnerships import _create_mexy_provider
from tests.api.test_delivery_provider_onboarding import ONBOARDING_PAYLOAD, SAMPLE_POLYGON
from tests.conftest import requires_db

COVERED_LAT = 19.4326
COVERED_LNG = -99.1332

FAR_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [
            [-99.0500, 19.3800],
            [-99.0400, 19.3800],
            [-99.0400, 19.3900],
            [-99.0500, 19.3800],
        ]
    ],
}


@pytest.fixture(autouse=True)
def _clean_matching_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE restaurant_delivery_providers,
                         delivery_provider_pricing_configs, delivery_provider_schedules,
                         delivery_provider_zones, delivery_provider_members,
                         delivery_providers, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


@requires_db
def test_covered_restaurant_gets_partnership_with_zone_id(client, engine):
    provider_id = _create_mexy_provider(client)

    resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Tacos del Centro",
            "subdomain": "tacos-centro-match",
            "delivery_enabled": True,
            "takeout_enabled": False,
            "address": "Av. Juárez 100, CDMX",
            "latitude": COVERED_LAT,
            "longitude": COVERED_LNG,
        },
        headers=AUTH,
    )
    assert resp.status_code == 201
    restaurant_id = uuid.UUID(resp.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        link = session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.restaurant_id == restaurant_id,
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
            )
        )
        assert link is not None
        assert link.status == "pending"
        assert link.zone_id is not None


@requires_db
def test_uncovered_restaurant_creates_no_partnership(client, engine):
    _create_mexy_provider(client)

    resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Far Away",
            "subdomain": "far-away",
            "delivery_enabled": True,
            "latitude": 0.0,
            "longitude": 0.0,
        },
        headers=AUTH,
    )
    assert resp.status_code == 201

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        count = session.query(RestaurantDeliveryProvider).count()
        assert count == 0


@requires_db
def test_mexy_coverage_preview_null_when_out_of_range(client):
    _create_mexy_provider(client)

    resp = client.get(
        "/api/v1/restaurants/mexy-coverage",
        params={"latitude": 0, "longitude": 0},
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["zone"] is None
    assert body["distance_km"] is None


@requires_db
def test_mexy_coverage_preview_missing_coords_returns_400(client):
    resp = client.get("/api/v1/restaurants/mexy-coverage", headers=AUTH)
    assert resp.status_code == 400
    assert resp.json()["error"]["message"] == "El negocio no tiene ubicación"


@requires_db
def test_mexy_coverage_and_partnership_pick_nearest_zone(client, engine):
    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    MEXY_USER = uuid.UUID("33333333-3333-3333-3333-333333333333")

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth
    client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )

    zones_resp = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH)
    nearer_zone_id = zones_resp.json()[0]["id"]

    farther_zone = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={
            "name": "Zona lejana",
            "polygon": FAR_POLYGON,
        },
        headers=AUTH,
    )
    assert farther_zone.status_code == 201
    farther_zone_id = farther_zone.json()["id"]
    assert farther_zone_id != nearer_zone_id

    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)

    preview = client.get(
        "/api/v1/restaurants/mexy-coverage",
        params={"latitude": COVERED_LAT, "longitude": COVERED_LNG},
        headers=AUTH,
    )
    assert preview.status_code == 200
    assert preview.json()["zone"]["id"] == nearer_zone_id

    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Nearest Zone Pick",
            "subdomain": "nearest-zone-pick",
            "delivery_enabled": True,
            "latitude": COVERED_LAT,
            "longitude": COVERED_LNG,
        },
        headers=AUTH,
    )
    assert create_resp.status_code == 201
    restaurant_id = uuid.UUID(create_resp.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        link = session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.restaurant_id == restaurant_id,
            )
        )
        assert link is not None
        assert str(link.zone_id) == nearer_zone_id

        nearer = session.get(DeliveryProviderZone, uuid.UUID(nearer_zone_id))
        farther = session.get(DeliveryProviderZone, uuid.UUID(farther_zone_id))
        assert nearer is not None
        assert farther is not None
