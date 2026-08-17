import uuid

import pytest
from sqlalchemy import text

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
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


def _default_assignment_patch_payload() -> dict:
    return {
        "offer_timeout_seconds": 60,
        "pre_free_eta_seconds": 60,
        "driver_location_staleness_seconds": 90,
        "min_protected_drivers": 2,
        "high_demand_available_drivers_max": 2,
        "high_demand_occupied_ratio": 0.8,
        "high_demand_pending_min": 5,
        "near_destination_radius_meters": 800,
        "max_extra_route_minutes": 8,
        "max_pickup_detour_minutes": 8,
        "max_destination_detour_minutes": 8,
        "max_active_packages_per_driver": 3,
        "assignment_retry_seconds": 30,
        "assignment_timeout_seconds": 900,
    }


@requires_db
def test_operator_can_get_assignment_settings(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        response = client.get("/api/v1/delivery-providers/me/assignment-settings", headers=AUTH)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["offer_timeout_seconds"] == 45
        assert body["pre_free_speed_mps"] == 8
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_operator_cannot_patch_assignment_settings(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        blocked = client.patch(
            "/api/v1/delivery-providers/me/assignment-settings",
            json=_default_assignment_patch_payload(),
            headers=AUTH,
        )
        assert blocked.status_code == 403
        assert blocked.json()["error"]["message"] == "Tu rol no permite modificar esta configuración"
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_owner_can_patch_offer_timeout(client):
    _create_provider(client)

    updated = client.patch(
        "/api/v1/delivery-providers/me/assignment-settings",
        json={"offer_timeout_seconds": 60},
        headers=AUTH,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["offer_timeout_seconds"] == 60
    assert body["pre_free_eta_seconds"] == 60
    assert body["assignment_timeout_seconds"] == 900
