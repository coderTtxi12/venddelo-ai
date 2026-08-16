import uuid

import pytest
from sqlalchemy import text

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.main import app
from tests.api.test_delivery_provider_onboarding import AUTH, ONBOARDING_PAYLOAD, SAMPLE_POLYGON
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
                TRUNCATE delivery_provider_pricing_configs, delivery_provider_schedules,
                         delivery_provider_zones, delivery_provider_members,
                         delivery_providers, users
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
