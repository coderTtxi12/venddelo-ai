import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import DeliveryProviderMember
from app.main import app
from tests.api.test_delivery_provider_onboarding import AUTH, ONBOARDING_PAYLOAD
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
OPERATOR = uuid.UUID("33333333-3333-3333-3333-333333333333")


class FakeAuth(AuthPort):
    def __init__(self, user_id: uuid.UUID = OWNER, email: str = "test@example.com") -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            from app.core.exceptions import UnauthorizedError

            raise UnauthorizedError("Invalid token")
        return AuthenticatedUser(id=self._user_id, email=self._email)


@pytest.fixture(autouse=True)
def _clean_delivery_admin_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_provider_admin_invites, delivery_provider_schedules,
                         delivery_provider_zones, delivery_provider_members,
                         delivery_providers, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


def _create_provider(client) -> uuid.UUID:
    resp = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    return uuid.UUID(resp.json()["id"])


def _invite_and_claim_operator(client, provider_id: uuid.UUID) -> None:
    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "operador@empresa.com", "member_role": "operator"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    assert created.json()["member_role"] == "operator"

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


def _primary_zone_id(client) -> str:
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    return zones[0]["id"]


@requires_db
def test_owner_can_invite_operator(client, engine):
    _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "operador@empresa.com", "member_role": "operator"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == "operador@empresa.com"
    assert body["member_role"] == "operator"


@requires_db
def test_invited_operator_claims_operator_role(client, engine):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == OPERATOR,
            )
        )
        assert member is not None
        assert member.member_role == "operator"


@requires_db
def test_operator_cannot_update_profile(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        blocked = client.patch(
            "/api/v1/delivery-providers/me",
            json={
                "company_name": "Otra empresa",
                "responsible_name": "Nombre",
                "responsible_phone": "+525512345678",
                "whatsapp_phone": "+525512345678",
            },
            headers=AUTH,
        )
        assert blocked.status_code == 403
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_operator_can_update_weather_mode(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)
    zone_id = _primary_zone_id(client)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        updated = client.patch(
            f"/api/v1/delivery-providers/me/pricing/weather-mode?zone_id={zone_id}",
            json={"weather_mode": "light"},
            headers=AUTH,
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["weather_mode"] == "light"
    finally:
        app.dependency_overrides.pop(get_auth, None)


def _default_pricing_update_payload() -> dict:
    from app.modules.delivery_providers.pricing import config_to_json, default_pricing_config

    return {"config": config_to_json(default_pricing_config())}


@requires_db
def test_operator_cannot_update_pricing(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)
    zone_id = _primary_zone_id(client)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        blocked = client.put(
            f"/api/v1/delivery-providers/me/pricing?zone_id={zone_id}",
            json=_default_pricing_update_payload(),
            headers=AUTH,
        )
        assert blocked.status_code == 403
        assert blocked.json()["error"]["message"] == "Tu rol no permite modificar esta configuración"
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_operator_can_simulate_pricing(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)
    zone_id = _primary_zone_id(client)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        quote = client.post(
            f"/api/v1/delivery-providers/me/pricing/simulate?zone_id={zone_id}",
            json={"inside_polygon": True, "is_night": False},
            headers=AUTH,
        )
        assert quote.status_code == 200, quote.text
        assert "total_cents" in quote.json()
    finally:
        app.dependency_overrides.pop(get_auth, None)
