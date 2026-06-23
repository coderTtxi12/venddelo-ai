import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import RestaurantDeliveryProvider
from tests.api.test_api_v1 import AUTH, OWNER
from tests.api.test_delivery_provider_onboarding import ONBOARDING_PAYLOAD
from tests.conftest import requires_db

MEXY_USER = uuid.UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture(autouse=True)
def _clean_partnership_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE restaurant_delivery_providers,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


def _create_mexy_provider(client) -> uuid.UUID:
    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth
    resp = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert resp.status_code == 201
    provider_id = uuid.UUID(resp.json()["id"])
    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)
    return provider_id


@requires_db
def test_onboarding_with_delivery_creates_mexy_partnership_request(client, engine):
    provider_id = _create_mexy_provider(client)

    resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Tacos del Centro",
            "subdomain": "tacos-centro",
            "delivery_enabled": True,
            "takeout_enabled": False,
            "address": "Av. Juárez 100, CDMX",
            "latitude": 19.4326,
            "longitude": -99.1332,
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
        assert link.is_default is False


@requires_db
def test_request_partnership_creates_mexy_provider_when_missing(client, engine):
    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Auto Mexy",
            "subdomain": "auto-mexy",
            "delivery_enabled": True,
        },
        headers=AUTH,
    )
    restaurant_id = create_resp.json()["id"]

    request_resp = client.post(
        f"/api/v1/restaurants/{restaurant_id}/delivery-partnership/request",
        headers=AUTH,
    )
    assert request_resp.status_code == 200
    body = request_resp.json()
    assert body["partnership"] is not None
    assert body["partnership"]["status"] == "pending"
    assert body["partnership"]["provider_name"] == "Mexy Reparto"

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        from app.db.models.delivery import DeliveryProvider

        provider = session.scalar(
            select(DeliveryProvider).where(DeliveryProvider.slug == "mexy-reparto")
        )
        assert provider is not None


@requires_db
def test_restaurant_can_read_delivery_partnership_status(client, engine):
    _create_mexy_provider(client)

    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Status Check",
            "subdomain": "status-check",
            "delivery_enabled": True,
        },
        headers=AUTH,
    )
    restaurant_id = create_resp.json()["id"]

    status_resp = client.get(
        f"/api/v1/restaurants/{restaurant_id}/delivery-partnership",
        headers=AUTH,
    )
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["partnership"] is not None
    assert body["partnership"]["status"] == "pending"
    assert body["partnership"]["provider_name"] == "Mexy Reparto"


@requires_db
def test_restaurant_delivery_partnership_null_when_delivery_disabled(client, engine):
    _create_mexy_provider(client)

    resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Solo Takeout",
            "subdomain": "solo-takeout",
            "delivery_enabled": False,
            "takeout_enabled": True,
        },
        headers=AUTH,
    )
    assert resp.status_code == 201

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        count = session.query(RestaurantDeliveryProvider).count()
        assert count == 0


@requires_db
def test_enabling_delivery_later_creates_mexy_request(client, engine):
    provider_id = _create_mexy_provider(client)

    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Toggle Delivery",
            "subdomain": "toggle-delivery",
            "delivery_enabled": False,
        },
        headers=AUTH,
    )
    restaurant_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/api/v1/restaurants/{restaurant_id}",
        json={"delivery_enabled": True},
        headers=AUTH,
    )
    assert patch_resp.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        link = session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.restaurant_id == uuid.UUID(restaurant_id),
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
            )
        )
        assert link is not None
        assert link.status == "pending"


@requires_db
def test_delivery_provider_member_sees_platform_requests_with_non_mexy_slug(client, engine):
    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Non Mexy Slug",
            "subdomain": "non-mexy-slug",
            "delivery_enabled": True,
        },
        headers=AUTH,
    )
    restaurant_id = create_resp.json()["id"]
    request_resp = client.post(
        f"/api/v1/restaurants/{restaurant_id}/delivery-partnership/request",
        headers=AUTH,
    )
    assert request_resp.status_code == 200

    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class CourierAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="courier@example.com")

    app.dependency_overrides[get_auth] = CourierAuth
    resp = client.post(
        "/api/v1/delivery-providers/onboarding",
        json={
            **ONBOARDING_PAYLOAD,
            "company_name": "Ricardo Rod Delivery",
        },
        headers=AUTH,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == "ricardo-rod-delivery"

    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["restaurant"]["name"] == "Non Mexy Slug"

    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)


@requires_db
def test_mexy_courier_sees_requests_on_platform_provider(client, engine):
    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Platform Link",
            "subdomain": "platform-link",
            "delivery_enabled": True,
        },
        headers=AUTH,
    )
    restaurant_id = create_resp.json()["id"]

    request_resp = client.post(
        f"/api/v1/restaurants/{restaurant_id}/delivery-partnership/request",
        headers=AUTH,
    )
    assert request_resp.status_code == 200

    courier_provider_id = _create_mexy_provider(client)

    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth

    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 1
    assert body[0]["restaurant"]["name"] == "Platform Link"

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        from app.db.models.delivery import DeliveryProvider

        platform_id = session.scalar(
            select(DeliveryProvider.id).where(DeliveryProvider.slug == "mexy-reparto")
        )
        assert platform_id is not None
        assert courier_provider_id != platform_id

    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)


@requires_db
def test_provider_lists_accepts_and_rejects_partnership_requests(client, engine):
    provider_id = _create_mexy_provider(client)

    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Bistro Norte",
            "subdomain": "bistro-norte",
            "delivery_enabled": True,
            "address": "Calle Norte 45",
            "whatsapp_phone": "+525512345678",
            "owner_contact_name": "Ana Dueña",
            "owner_phone": "+525598765432",
        },
        headers=AUTH,
    )
    restaurant_id = create_resp.json()["id"]

    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth

    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 1
    assert body[0]["restaurant"]["name"] == "Bistro Norte"
    assert body[0]["restaurant"]["address"] == "Calle Norte 45"
    assert body[0]["restaurant"]["owner_display_name"] == "Ana Dueña"
    assert body[0]["restaurant"]["owner_phone"] == "+525598765432"
    link_id = body[0]["id"]

    accepted = client.post(
        f"/api/v1/delivery-providers/me/partnership-requests/{link_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "active"
    assert accepted.json()["restaurant"]["id"] == restaurant_id
    assert accepted.json()["activated_at"] is not None

    active = client.get("/api/v1/delivery-providers/me/partnerships", headers=AUTH)
    assert active.status_code == 200
    active_body = active.json()
    assert len(active_body) == 1
    assert active_body[0]["restaurant"]["name"] == "Bistro Norte"
    assert active_body[0]["status"] == "active"

    pending_after = client.get(
        "/api/v1/delivery-providers/me/partnership-requests", headers=AUTH
    )
    assert pending_after.status_code == 200
    assert len(pending_after.json()) == 0

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        link = session.get(RestaurantDeliveryProvider, uuid.UUID(link_id))
        assert link is not None
        assert link.status == "active"
        assert link.is_default is True
        assert link.activated_at is not None

    # Second restaurant for reject flow
    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)
    reject_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Rechazado",
            "subdomain": "rechazado",
            "delivery_enabled": True,
        },
        headers=AUTH,
    )
    reject_restaurant_id = reject_resp.json()["id"]

    app.dependency_overrides[get_auth] = MexyAuth
    listed_again = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    reject_link_id = listed_again.json()[0]["id"]

    rejected = client.post(
        f"/api/v1/delivery-providers/me/partnership-requests/{reject_link_id}/reject",
        headers=AUTH,
    )
    assert rejected.status_code == 204

    with factory() as session:
        deleted = session.get(RestaurantDeliveryProvider, uuid.UUID(reject_link_id))
        assert deleted is None

    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)
