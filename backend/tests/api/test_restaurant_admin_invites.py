import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.restaurant import RestaurantAdminInvite, RestaurantMember
from app.main import app
from tests.api.test_api_v1 import AUTH
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
ADMIN = uuid.UUID("22222222-2222-2222-2222-222222222222")
OTHER_OWNER = uuid.UUID("33333333-3333-3333-3333-333333333333")


class FakeAuth(AuthPort):
    def __init__(self, user_id: uuid.UUID = OWNER, email: str = "owner@example.com") -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            from app.core.exceptions import UnauthorizedError

            raise UnauthorizedError("Invalid token")
        return AuthenticatedUser(id=self._user_id, email=self._email)


@pytest.fixture(autouse=True)
def _clean_restaurant_admin_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE restaurant_admin_invites, restaurant_members,
                         restaurant_payment_methods, restaurant_schedules,
                         restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


def _create_restaurant(client) -> uuid.UUID:
    resp = client.post(
        "/api/v1/restaurants",
        json={"name": "Tacos", "subdomain": "tacos-admin"},
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    return uuid.UUID(resp.json()["id"])


@requires_db
def test_owner_can_add_and_list_admin_invites(client):
    _create_restaurant(client)

    created = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "Admin@Empresa.COM"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == "admin@empresa.com"

    listed = client.get("/api/v1/restaurants/me/admin-invites", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == [body]


@requires_db
def test_owner_cannot_invite_email_associated_with_other_restaurant(client):
    _create_restaurant(client)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OTHER_OWNER,
        email="other.owner@example.com",
    )
    try:
        other = client.post(
            "/api/v1/restaurants",
            json={"name": "Burgers", "subdomain": "burgers-admin"},
            headers=AUTH,
        )
        assert other.status_code == 201
        conflict = client.post(
            "/api/v1/restaurants/me/admin-invites",
            json={"email": "shared.admin@empresa.com"},
            headers=AUTH,
        )
        assert conflict.status_code == 201
    finally:
        app.dependency_overrides.pop(get_auth, None)

    blocked = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "shared.admin@empresa.com"},
        headers=AUTH,
    )
    assert blocked.status_code == 409


@requires_db
def test_invited_admin_claims_membership_on_me_and_skips_onboarding(client, engine):
    restaurant_id = _create_restaurant(client)

    add = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "nuevo.admin@empresa.com"},
        headers=AUTH,
    )
    assert add.status_code == 201

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/restaurants/me", headers=AUTH)
        assert me.status_code == 200, me.text
        payload = me.json()
        assert payload["member_role"] == "admin"
        assert payload["restaurant"]["id"] == str(restaurant_id)
    finally:
        app.dependency_overrides.pop(get_auth, None)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        member = session.scalar(
            select(RestaurantMember).where(
                RestaurantMember.restaurant_id == restaurant_id,
                RestaurantMember.user_id == ADMIN,
            )
        )
        assert member is not None
        assert member.member_role == "admin"

        invite = session.scalar(
            select(RestaurantAdminInvite).where(
                RestaurantAdminInvite.restaurant_id == restaurant_id
            )
        )
        assert invite is None


@requires_db
def test_owner_can_list_active_admin_members(client):
    _create_restaurant(client)

    client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "nuevo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="nuevo.admin@empresa.com",
    )
    try:
        claimed = client.get("/api/v1/restaurants/me", headers=AUTH)
        assert claimed.status_code == 200
        assert claimed.json()["member_role"] == "admin"
    finally:
        app.dependency_overrides.pop(get_auth, None)

    listed = client.get("/api/v1/restaurants/me/members", headers=AUTH)
    assert listed.status_code == 200, listed.text
    members = listed.json()
    assert len(members) == 2
    roles = {row["member_role"] for row in members}
    assert roles == {"owner", "admin"}
    assert members[0]["member_role"] == "owner"


@requires_db
def test_owner_cannot_invite_active_admin_again(client):
    _create_restaurant(client)

    client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="activo.admin@empresa.com",
    )
    try:
        claimed = client.get("/api/v1/restaurants/me", headers=AUTH)
        assert claimed.status_code == 200
        assert claimed.json()["member_role"] == "admin"
    finally:
        app.dependency_overrides.pop(get_auth, None)

    blocked = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )
    assert blocked.status_code == 409


@requires_db
def test_owner_cannot_add_duplicate_pending_invite(client):
    _create_restaurant(client)

    first = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "pendiente@empresa.com"},
        headers=AUTH,
    )
    assert first.status_code == 201

    duplicate = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "Pendiente@Empresa.COM"},
        headers=AUTH,
    )
    assert duplicate.status_code == 409


@requires_db
def test_admin_can_be_invited_to_multiple_restaurants(client):
    restaurant_a = _create_restaurant(client)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OTHER_OWNER,
        email="other.owner@example.com",
    )
    try:
        other = client.post(
            "/api/v1/restaurants",
            json={"name": "Burgers", "subdomain": "burgers-multi"},
            headers=AUTH,
        )
        assert other.status_code == 201
        restaurant_b_id = other.json()["id"]

        first_invite = client.post(
            "/api/v1/restaurants/me/admin-invites",
            json={"email": "multi.admin@empresa.com"},
            headers=AUTH,
        )
        assert first_invite.status_code == 201
    finally:
        app.dependency_overrides.pop(get_auth, None)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OWNER,
        email="owner@example.com",
    )
    try:
        second_invite = client.post(
            "/api/v1/restaurants/me/admin-invites",
            json={"email": "multi.admin@empresa.com"},
            headers=AUTH,
        )
        assert second_invite.status_code == 201, second_invite.text
    finally:
        app.dependency_overrides.pop(get_auth, None)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="multi.admin@empresa.com",
    )
    try:
        access = client.get("/api/v1/restaurants/me/access", headers=AUTH)
        assert access.status_code == 200, access.text
        restaurant_ids = {item["restaurant"]["id"] for item in access.json()["items"]}
        assert str(restaurant_a) in restaurant_ids
        assert restaurant_b_id in restaurant_ids
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_owner_can_remove_active_admin_member(client):
    _create_restaurant(client)

    invite = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "removable.admin@empresa.com"},
        headers=AUTH,
    )
    assert invite.status_code == 201

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="removable.admin@empresa.com",
    )
    try:
        claimed = client.get("/api/v1/restaurants/me", headers=AUTH)
        assert claimed.status_code == 200
    finally:
        app.dependency_overrides.pop(get_auth, None)

    members = client.get("/api/v1/restaurants/me/members", headers=AUTH)
    assert members.status_code == 200
    admin_row = next(row for row in members.json() if row["member_role"] == "admin")

    removed = client.delete(
        f"/api/v1/restaurants/me/members/{admin_row['id']}",
        headers=AUTH,
    )
    assert removed.status_code == 204

    members_after = client.get("/api/v1/restaurants/me/members", headers=AUTH)
    assert all(row["member_role"] != "admin" for row in members_after.json())


@requires_db
def test_non_owner_cannot_manage_admin_invites(client):
    _create_restaurant(client)

    client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "activo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="activo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/restaurants/me", headers=AUTH)
        assert me.status_code == 200
        assert me.json()["member_role"] == "admin"

        forbidden = client.get("/api/v1/restaurants/me/members", headers=AUTH)
        assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_invited_admin_cannot_create_own_restaurant(client):
    _create_restaurant(client)

    client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "solo.admin@empresa.com"},
        headers=AUTH,
    )

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=ADMIN,
        email="solo.admin@empresa.com",
    )
    try:
        me = client.get("/api/v1/restaurants/me", headers=AUTH)
        assert me.status_code == 200

        blocked = client.post(
            "/api/v1/restaurants",
            json={"name": "Otro", "subdomain": "otro-admin"},
            headers=AUTH,
        )
        assert blocked.status_code == 409
    finally:
        app.dependency_overrides.pop(get_auth, None)
