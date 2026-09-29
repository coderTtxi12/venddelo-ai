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
from app.db.models.user import User
from app.main import app
from tests.api.test_delivery_provider_onboarding import AUTH, ONBOARDING_PAYLOAD
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
ADMIN = uuid.UUID("22222222-2222-2222-2222-222222222222")
OPERATOR = uuid.UUID("33333333-3333-3333-3333-333333333333")
DRIVER = uuid.UUID("44444444-4444-4444-4444-444444444444")
OTHER_ADMIN = uuid.UUID("66666666-6666-6666-6666-666666666666")


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
        _use_owner_auth()

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
        _use_owner_auth()

    blocked = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )
    assert blocked.status_code == 409


@requires_db
def test_operator_cannot_list_admin_members(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200
        assert me.json()["member_role"] == "operator"

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


def _use_owner_auth() -> None:
    app.dependency_overrides[get_auth] = lambda: FakeAuth()


def _invite_and_claim(client, *, email: str, user_id: uuid.UUID, member_role: str) -> None:
    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": email, "member_role": member_role},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text

    app.dependency_overrides[get_auth] = lambda: FakeAuth(user_id=user_id, email=email)
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == member_role
    finally:
        _use_owner_auth()


def _member_id(client, role: str) -> str:
    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert listed.status_code == 200, listed.text
    return next(row["id"] for row in listed.json() if row["member_role"] == role)


@requires_db
def test_owner_can_remove_active_admin(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    member_id = _member_id(client, "admin")

    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert removed.status_code == 204
    assert removed.content == b""

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert all(row["member_role"] != "admin" for row in listed.json())

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200
        assert me.json()["provider"] is None
        assert me.json()["member_role"] is None
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_owner_can_remove_active_operator(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )
    member_id = _member_id(client, "operator")

    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert removed.status_code == 204

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert all(row["member_role"] != "operator" for row in listed.json())

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.json()["provider"] is None
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_owner_cannot_remove_self(client):
    _create_provider(client)
    owner_id = _member_id(client, "owner")

    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{owner_id}",
        headers=AUTH,
    )
    assert removed.status_code == 400
    assert removed.json()["error"]["message"] == "No puedes quitar al propietario"

    listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert any(row["member_role"] == "owner" for row in listed.json())


@requires_db
def test_admin_manages_team_without_seeing_or_removing_owner(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    _invite_and_claim(
        client,
        email="otro.admin@empresa.com",
        user_id=OTHER_ADMIN,
        member_role="admin",
    )
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )
    owner_id = _member_id(client, "owner")
    operator_id = _member_id(client, "operator")

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
        assert listed.status_code == 200, listed.text
        roles = {row["member_role"] for row in listed.json()}
        assert "owner" not in roles
        assert roles == {"admin", "operator"}
        self_id = next(row["id"] for row in listed.json() if row["user_id"] == str(ADMIN))

        invited = client.post(
            "/api/v1/delivery-providers/me/admin-invites",
            json={"email": "nuevo.operador@empresa.com", "member_role": "operator"},
            headers=AUTH,
        )
        assert invited.status_code == 201, invited.text

        removed_operator = client.delete(
            f"/api/v1/delivery-providers/me/members/{operator_id}",
            headers=AUTH,
        )
        assert removed_operator.status_code == 204

        removed_self = client.delete(
            f"/api/v1/delivery-providers/me/members/{self_id}",
            headers=AUTH,
        )
        assert removed_self.status_code == 400
        assert removed_self.json()["error"]["message"] == "No puedes quitarte a ti mismo"

        removed_owner = client.delete(
            f"/api/v1/delivery-providers/me/members/{owner_id}",
            headers=AUTH,
        )
        assert removed_owner.status_code == 404
        assert removed_owner.json()["error"]["message"] == "Miembro no encontrado"
    finally:
        _use_owner_auth()

    owner_list = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
    assert owner_list.status_code == 200
    remaining = {row["member_role"] for row in owner_list.json()}
    assert "owner" in remaining
    assert "operator" not in remaining
    assert any(row["user_id"] == str(ADMIN) for row in owner_list.json())


@requires_db
def test_remove_unknown_member_returns_404(client):
    _create_provider(client)
    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{uuid.uuid4()}",
        headers=AUTH,
    )
    assert removed.status_code == 404
    assert removed.json()["error"]["message"] == "Miembro no encontrado"


@requires_db
def test_remove_already_inactive_member_returns_404(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    member_id = _member_id(client, "admin")
    first = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert first.status_code == 204

    second = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert second.status_code == 404
    assert second.json()["error"]["message"] == "Miembro no encontrado"


@requires_db
def test_owner_cannot_remove_driver_or_dispatcher(client, engine):
    provider_id = _create_provider(client)
    dispatcher_id = uuid.UUID("55555555-5555-5555-5555-555555555555")
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.add(User(id=DRIVER, email="driver@empresa.com"))
        session.add(User(id=dispatcher_id, email="dispatcher@empresa.com"))
        session.flush()
        driver = DeliveryProviderMember(
            delivery_provider_id=provider_id,
            user_id=DRIVER,
            member_role="driver",
            is_active=True,
        )
        dispatcher = DeliveryProviderMember(
            delivery_provider_id=provider_id,
            user_id=dispatcher_id,
            member_role="dispatcher",
            is_active=True,
        )
        session.add(driver)
        session.add(dispatcher)
        session.commit()
        member_ids = [driver.id, dispatcher.id]

    for member_id in member_ids:
        removed = client.delete(
            f"/api/v1/delivery-providers/me/members/{member_id}",
            headers=AUTH,
        )
        assert removed.status_code == 400
        assert (
            removed.json()["error"]["message"]
            == "Solo puedes quitar administradores y operadores"
        )


@requires_db
def test_admin_can_remove_another_admin(client):
    _create_provider(client)
    _invite_and_claim(
        client,
        email="nuevo.admin@empresa.com",
        user_id=ADMIN,
        member_role="admin",
    )
    _invite_and_claim(
        client,
        email="otro.admin@empresa.com",
        user_id=OTHER_ADMIN,
        member_role="admin",
    )
    other_id = next(
        row["id"]
        for row in client.get("/api/v1/delivery-providers/me/members", headers=AUTH).json()
        if row["user_id"] == str(OTHER_ADMIN)
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        removed = client.delete(
            f"/api/v1/delivery-providers/me/members/{other_id}",
            headers=AUTH,
        )
        assert removed.status_code == 204
        listed = client.get("/api/v1/delivery-providers/me/members", headers=AUTH)
        assert all(row["user_id"] != str(OTHER_ADMIN) for row in listed.json())
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_reinvite_reactivates_member_with_new_role(client, engine):
    provider_id = _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )
    member_id = _member_id(client, "operator")
    removed = client.delete(
        f"/api/v1/delivery-providers/me/members/{member_id}",
        headers=AUTH,
    )
    assert removed.status_code == 204

    invited = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "operador@empresa.com", "member_role": "admin"},
        headers=AUTH,
    )
    assert invited.status_code == 201, invited.text

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "admin"
        assert me.json()["provider"]["id"] == str(provider_id)
    finally:
        app.dependency_overrides.pop(get_auth, None)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == OPERATOR,
            )
        )
        assert member is not None
        assert member.is_active is True
        assert member.member_role == "admin"
        invite = session.scalar(
            select(DeliveryProviderAdminInvite).where(
                DeliveryProviderAdminInvite.delivery_provider_id == provider_id
            )
        )
        assert invite is None


@requires_db
def test_claim_does_not_overwrite_active_member_role(client, engine):
    provider_id = _create_provider(client)
    _invite_and_claim(
        client,
        email="operador@empresa.com",
        user_id=OPERATOR,
        member_role="operator",
    )

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.add(
            DeliveryProviderAdminInvite(
                delivery_provider_id=provider_id,
                email="operador@empresa.com",
                member_role="admin",
            )
        )
        session.commit()

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "operator"
    finally:
        app.dependency_overrides.pop(get_auth, None)

    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == OPERATOR,
            )
        )
        assert member is not None
        assert member.member_role == "operator"
        assert member.is_active is True
        invite = session.scalar(select(DeliveryProviderAdminInvite))
        assert invite is None
