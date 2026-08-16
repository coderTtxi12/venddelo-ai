import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import RestaurantDeliveryProvider
from app.db.models.restaurant import Restaurant
from app.main import app
from tests.api.test_api_v1 import AUTH, OWNER
from tests.api.test_delivery_partnerships import COVERED_LAT, COVERED_LNG, _create_mexy_provider
from tests.api.test_delivery_provider_onboarding import ONBOARDING_PAYLOAD, SAMPLE_POLYGON
from tests.api.test_delivery_zone_matching import FAR_POLYGON
from tests.conftest import requires_db

OPERATOR = uuid.UUID("33333333-3333-3333-3333-333333333333")


class FakeAuth(AuthPort):
    def __init__(self, user_id: uuid.UUID, email: str = "test@example.com") -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            from app.core.exceptions import UnauthorizedError

            raise UnauthorizedError("Invalid token")
        return AuthenticatedUser(id=self._user_id, email=self._email)


@pytest.fixture(autouse=True)
def _clean_delivery_zone_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE restaurant_delivery_providers, delivery_provider_pricing_configs,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


def _invite_and_claim_operator(client, provider_id: uuid.UUID) -> None:
    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "operador@empresa.com", "member_role": "operator"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "operator"
        assert me.json()["provider"]["id"] == str(provider_id)
    finally:
        app.dependency_overrides.pop(get_auth, None)


def _create_second_zone(client) -> dict:
    resp = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={
            "name": "Norte",
            "polygon": SAMPLE_POLYGON,
            "center_lat": 19.436,
            "center_lng": -99.126,
        },
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _seed_partnerships(
    engine, provider_id: uuid.UUID, zone_id: uuid.UUID, count: int
) -> None:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        for index in range(count):
            restaurant = Restaurant(
                name=f"Restaurante {index}",
                subdomain=f"rest-{uuid.uuid4().hex[:8]}",
            )
            session.add(restaurant)
            session.flush()
            session.add(
                RestaurantDeliveryProvider(
                    restaurant_id=restaurant.id,
                    delivery_provider_id=provider_id,
                    zone_id=zone_id,
                    status="active",
                )
            )
        session.commit()


@requires_db
def test_create_zone_rejects_duplicate_name_case_insensitive(client, engine):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    me = client.get("/api/v1/delivery-providers/me", headers=AUTH).json()
    assert len(me["zones"]) == 1
    north = {
        "name": "Centro",
        "polygon": SAMPLE_POLYGON,
        "center_lat": 19.436,
        "center_lng": -99.126,
    }
    resp = client.post("/api/v1/delivery-providers/me/zones", json=north, headers=AUTH)
    assert resp.status_code == 201
    dup = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={**north, "name": "centro"},
        headers=AUTH,
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["message"] == "Ya existe una zona con ese nombre"


@requires_db
def test_delete_last_zone_conflict(client):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    assert len(zones) == 1
    resp = client.delete(f"/api/v1/delivery-providers/me/zones/{zones[0]['id']}", headers=AUTH)
    assert resp.status_code == 409
    assert resp.json()["error"]["message"] == "Debes conservar al menos una zona"


@requires_db
def test_operator_cannot_create_zone(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201
    provider_id = uuid.UUID(create.json()["id"])
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        blocked = client.post(
            "/api/v1/delivery-providers/me/zones",
            json={
                "name": "Norte",
                "polygon": SAMPLE_POLYGON,
                "center_lat": 19.436,
                "center_lng": -99.126,
            },
            headers=AUTH,
        )
        assert blocked.status_code == 403
        assert blocked.json()["error"]["message"] == "Tu rol no permite modificar esta configuración"
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_delete_zone_with_one_partnership_conflict(client, engine):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    provider_id = uuid.UUID(
        client.get("/api/v1/delivery-providers/me", headers=AUTH).json()["provider"]["id"]
    )
    zone = _create_second_zone(client)
    _seed_partnerships(engine, provider_id, uuid.UUID(zone["id"]), 1)

    resp = client.delete(f"/api/v1/delivery-providers/me/zones/{zone['id']}", headers=AUTH)
    assert resp.status_code == 409
    assert resp.json()["error"]["message"] == "Reasigna 1 negocio antes de eliminar esta zona"


@requires_db
def test_delete_zone_with_two_partnerships_conflict(client, engine):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    provider_id = uuid.UUID(
        client.get("/api/v1/delivery-providers/me", headers=AUTH).json()["provider"]["id"]
    )
    zone = _create_second_zone(client)
    _seed_partnerships(engine, provider_id, uuid.UUID(zone["id"]), 2)

    resp = client.delete(f"/api/v1/delivery-providers/me/zones/{zone['id']}", headers=AUTH)
    assert resp.status_code == 409
    assert resp.json()["error"]["message"] == "Reasigna 2 negocios antes de eliminar esta zona"


@requires_db
def test_operator_can_list_zones(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201
    provider_id = uuid.UUID(create.json()["id"])
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        resp = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_pricing_requires_zone_id(client):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    resp = client.get("/api/v1/delivery-providers/me/pricing", headers=AUTH)
    assert resp.status_code == 400
    assert resp.json()["error"]["message"] == "Indica la zona"


@requires_db
def test_two_zones_have_independent_weather(client):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    z0 = zones[0]["id"]
    created = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={"name": "Norte", "polygon": SAMPLE_POLYGON, "center_lat": 19.44, "center_lng": -99.12},
        headers=AUTH,
    ).json()
    z1 = created["id"]
    client.patch(
        f"/api/v1/delivery-providers/me/pricing/weather-mode?zone_id={z1}",
        json={"weather_mode": "heavy"},
        headers=AUTH,
    )
    w0 = client.get(f"/api/v1/delivery-providers/me/pricing?zone_id={z0}", headers=AUTH).json()
    w1 = client.get(f"/api/v1/delivery-providers/me/pricing?zone_id={z1}", headers=AUTH).json()
    assert w0["weather_mode"] == "none"
    assert w1["weather_mode"] == "heavy"


@requires_db
def test_operator_cannot_patch_or_delete_zone(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201
    provider_id = uuid.UUID(create.json()["id"])
    zone_id = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()[0]["id"]
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        blocked_patch = client.patch(
            f"/api/v1/delivery-providers/me/zones/{zone_id}",
            json={
                "name": "Sur",
                "polygon": SAMPLE_POLYGON,
                "center_lat": 19.436,
                "center_lng": -99.126,
            },
            headers=AUTH,
        )
        assert blocked_patch.status_code == 403
        assert (
            blocked_patch.json()["error"]["message"]
            == "Tu rol no permite modificar esta configuración"
        )

        blocked_delete = client.delete(
            f"/api/v1/delivery-providers/me/zones/{zone_id}",
            headers=AUTH,
        )
        assert blocked_delete.status_code == 403
        assert (
            blocked_delete.json()["error"]["message"]
            == "Tu rol no permite modificar esta configuración"
        )
    finally:
        app.dependency_overrides.pop(get_auth, None)


def _mexy_auth_override() -> None:
    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=OPERATOR, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth


def _owner_auth_override() -> None:
    from app.api.deps import get_auth
    from app.main import app

    app.dependency_overrides[get_auth] = lambda: FakeAuth(OWNER)


def _accept_restaurant_partnership(client, subdomain: str) -> str:
    _mexy_auth_override()
    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    assert listed.status_code == 200, listed.text
    link_id = next(
        item["id"] for item in listed.json() if item["restaurant"]["subdomain"] == subdomain
    )
    accepted = client.post(
        f"/api/v1/delivery-providers/me/partnership-requests/{link_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200, accepted.text
    _owner_auth_override()
    return link_id


@requires_db
def test_quote_uses_assigned_zone_weather_not_other_zone(client):
    _create_mexy_provider(client)
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    assigned_zone_id = zones[0]["id"]

    norte = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={"name": "Norte", "polygon": FAR_POLYGON, "center_lat": 19.385, "center_lng": -99.045},
        headers=AUTH,
    )
    assert norte.status_code == 201, norte.text
    norte_zone_id = norte.json()["id"]

    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Zone Quote Test",
            "subdomain": "zone-quote-test",
            "delivery_enabled": True,
            "latitude": COVERED_LAT,
            "longitude": COVERED_LNG,
        },
        headers=AUTH,
    )
    assert create_resp.status_code == 201, create_resp.text
    _accept_restaurant_partnership(client, "zone-quote-test")

    client.patch(
        f"/api/v1/delivery-providers/me/pricing/weather-mode?zone_id={norte_zone_id}",
        json={"weather_mode": "intense"},
        headers=AUTH,
    )

    quote_ok = client.post(
        "/api/v1/public/restaurants/zone-quote-test/delivery-quote",
        json={"latitude": COVERED_LAT, "longitude": COVERED_LNG},
    )
    assert quote_ok.status_code == 200, quote_ok.text
    assert quote_ok.json()["available"] is True

    client.patch(
        f"/api/v1/delivery-providers/me/pricing/weather-mode?zone_id={assigned_zone_id}",
        json={"weather_mode": "intense"},
        headers=AUTH,
    )

    quote_blocked = client.post(
        "/api/v1/public/restaurants/zone-quote-test/delivery-quote",
        json={"latitude": COVERED_LAT, "longitude": COVERED_LNG},
    )
    assert quote_blocked.status_code == 200, quote_blocked.text
    assert quote_blocked.json()["available"] is False
    assert "lluvia intensa" in (quote_blocked.json().get("reason") or "").lower()


@requires_db
def test_reassign_partnership_zone_allows_deleting_original_zone(client, engine):
    _create_mexy_provider(client)
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    zone_a_id = zones[0]["id"]

    zone_b = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={"name": "Norte", "polygon": FAR_POLYGON, "center_lat": 19.385, "center_lng": -99.045},
        headers=AUTH,
    )
    assert zone_b.status_code == 201, zone_b.text
    zone_b_id = zone_b.json()["id"]

    create_resp = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Reassign Test",
            "subdomain": "reassign-test",
            "delivery_enabled": True,
            "latitude": COVERED_LAT,
            "longitude": COVERED_LNG,
        },
        headers=AUTH,
    )
    assert create_resp.status_code == 201, create_resp.text

    _mexy_auth_override()
    pending = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    assert pending.status_code == 200, pending.text
    link_id = pending.json()[0]["id"]
    assert pending.json()[0]["zone"]["id"] == zone_a_id

    reassigned = client.patch(
        f"/api/v1/delivery-providers/me/partnerships/{link_id}",
        json={"zone_id": zone_b_id},
        headers=AUTH,
    )
    assert reassigned.status_code == 200, reassigned.text
    assert reassigned.json()["zone"]["id"] == zone_b_id

    filtered = client.get(
        f"/api/v1/delivery-providers/me/partnership-requests?zone_id={zone_b_id}",
        headers=AUTH,
    )
    assert filtered.status_code == 200, filtered.text
    assert any(item["id"] == link_id for item in filtered.json())

    not_on_a = client.get(
        f"/api/v1/delivery-providers/me/partnership-requests?zone_id={zone_a_id}",
        headers=AUTH,
    )
    assert not_on_a.status_code == 200, not_on_a.text
    assert not any(item["id"] == link_id for item in not_on_a.json())

    deleted = client.delete(
        f"/api/v1/delivery-providers/me/zones/{zone_a_id}",
        headers=AUTH,
    )
    assert deleted.status_code == 204, deleted.text
    _owner_auth_override()
