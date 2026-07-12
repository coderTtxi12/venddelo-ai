import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import (
    DeliveryProvider,
    DeliveryProviderAdminInvite,
    DeliveryProviderMember,
)
from app.main import app
from tests.api.test_delivery_provider_onboarding import AUTH, ONBOARDING_PAYLOAD
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
ADMIN = uuid.UUID("22222222-2222-2222-2222-222222222222")


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


@requires_db
def test_owner_can_add_and_list_admin_invites(client):
    _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "Admin@Empresa.COM"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == "admin@empresa.com"

    listed = client.get("/api/v1/delivery-providers/me/admin-invites", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == [body]


@requires_db
def test_owner_can_remove_admin_invite(client):
    _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "admin@empresa.com"},
        headers=AUTH,
    )
    invite_id = created.json()["id"]

    deleted = client.delete(
        f"/api/v1/delivery-providers/me/admin-invites/{invite_id}",
        headers=AUTH,
    )
    assert deleted.status_code == 204

    listed = client.get("/api/v1/delivery-providers/me/admin-invites", headers=AUTH)
    assert listed.json() == []


@requires_db
def test_invited_admin_claims_membership_on_me_and_skips_onboarding(client, engine):
    provider_id = _create_provider(client)

    add = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "nuevo.admin@empresa.com"},
        headers=AUTH,
    )
    assert add.status_code == 201

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        payload = me.json()
        assert payload["member_role"] == "admin"
        assert payload["provider"]["id"] == str(provider_id)
    finally:
        app.dependency_overrides.pop(get_auth, None)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == ADMIN,
            )
        )
        assert member is not None
        assert member.member_role == "admin"

        invite = session.scalar(
            select(DeliveryProviderAdminInvite).where(
                DeliveryProviderAdminInvite.delivery_provider_id == provider_id
            )
        )
        assert invite is None


@requires_db
def test_owner_can_list_active_admin_members(client):
    _create_provider(client)

    client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "nuevo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        claimed = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert claimed.status_code == 200
        assert claimed.json()["member_role"] == "admin"
    finally:
        app.dependency_overrides.pop(get_auth, None)

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert listed.status_code == 200, listed.text
    members = listed.json()
    assert len(members) == 2
    roles = {row["member_role"] for row in members}
    assert roles == {"owner", "admin"}
    assert members[0]["member_role"] == "owner"
    admin_row = next(row for row in members if row["member_role"] == "admin")
    assert admin_row["email"] == "nuevo.admin@empresa.com"
    assert admin_row["user_id"] == str(ADMIN)


@requires_db
def test_owner_cannot_invite_active_admin_again(client):
    _create_provider(client)

    client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="activo.admin@empresa.com",
    )
    try:
        claimed = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert claimed.status_code == 200
        assert claimed.json()["member_role"] == "admin"
    finally:
        app.dependency_overrides.pop(get_auth, None)

    blocked = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )
    assert blocked.status_code == 409


@requires_db
def test_non_owner_cannot_list_admin_members(client):
    _create_provider(client)

    client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="activo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200
        assert me.json()["member_role"] == "admin"

        forbidden = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
        assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_active_invited_admin_gets_provider_without_onboarding(client, engine):
    provider_id = _create_provider(client)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        provider = session.get(DeliveryProvider, provider_id)
        assert provider is not None
        provider.status = "active"
        session.commit()

    client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="activo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200
        assert me.json()["provider"]["status"] == "active"
        assert me.json()["member_role"] == "admin"
    finally:
        app.dependency_overrides.pop(get_auth, None)
