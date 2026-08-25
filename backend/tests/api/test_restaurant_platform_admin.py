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
OTHER_OWNER = uuid.UUID("33333333-3333-3333-3333-333333333333")
PLATFORM_ADMIN = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
STRANGER = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
PLATFORM_EMAILS = (
    "marco.marc.181818@gmail.com",
    "alfredoquijanoflores@gmail.com",
)


class FakeAuth(AuthPort):
    def __init__(self, user_id: uuid.UUID, email: str) -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            from app.core.exceptions import UnauthorizedError

            raise UnauthorizedError("Invalid token")
        return AuthenticatedUser(id=self._user_id, email=self._email)


@pytest.fixture(autouse=True)
def _clean_restaurant_platform_admin_tables(engine):
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


def _as(client, user_id: uuid.UUID, email: str):
    app.dependency_overrides[get_auth] = lambda: FakeAuth(user_id, email)
    return client


def _create_restaurant(client, *, name: str, subdomain: str) -> uuid.UUID:
    resp = client.post(
        "/api/v1/restaurants",
        json={"name": name, "subdomain": subdomain},
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    return uuid.UUID(resp.json()["id"])


@requires_db
@pytest.mark.parametrize("platform_email", PLATFORM_EMAILS)
def test_platform_admin_accesses_all_restaurants_without_membership(
    client, engine, platform_email
):
    _as(client, OWNER, "owner@example.com")
    restaurant_a = _create_restaurant(client, name="Tacos", subdomain="tacos-plat")

    _as(client, OTHER_OWNER, "other.owner@example.com")
    restaurant_b = _create_restaurant(client, name="Burgers", subdomain="burgers-plat")

    _as(client, PLATFORM_ADMIN, platform_email)
    access = client.get("/api/v1/restaurants/me/access", headers=AUTH)
    assert access.status_code == 200, access.text
    ids = {item["restaurant"]["id"] for item in access.json()["items"]}
    assert str(restaurant_a) in ids
    assert str(restaurant_b) in ids
    assert all(item["member_role"] == "admin" for item in access.json()["items"])

    me = client.get("/api/v1/restaurants/me", headers=AUTH)
    assert me.status_code == 200, me.text
    assert me.json()["member_role"] == "admin"
    assert me.json()["restaurant"] is not None

    selected = client.post(
        "/api/v1/restaurants/me/select",
        json={"restaurant_id": str(restaurant_b)},
        headers=AUTH,
    )
    assert selected.status_code == 200, selected.text
    assert selected.json()["restaurant"]["id"] == str(restaurant_b)
    assert selected.json()["member_role"] == "admin"

    updated = client.patch(
        f"/api/v1/restaurants/{restaurant_b}",
        json={"description": "Cambio interno"},
        headers=AUTH,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["description"] == "Cambio interno"

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        membership = session.scalar(
            select(RestaurantMember.id).where(RestaurantMember.user_id == PLATFORM_ADMIN)
        )
        assert membership is None


@requires_db
@pytest.mark.parametrize("platform_email", PLATFORM_EMAILS)
def test_platform_admin_gains_new_restaurants_automatically(client, platform_email):
    _as(client, PLATFORM_ADMIN, platform_email)
    before = client.get("/api/v1/restaurants/me/access", headers=AUTH)
    assert before.status_code == 200
    assert before.json()["items"] == []

    _as(client, OWNER, "owner@example.com")
    restaurant_id = _create_restaurant(client, name="Nuevo", subdomain="nuevo-plat")

    _as(client, PLATFORM_ADMIN, platform_email)
    after = client.get("/api/v1/restaurants/me/access", headers=AUTH)
    assert after.status_code == 200, after.text
    ids = {item["restaurant"]["id"] for item in after.json()["items"]}
    assert str(restaurant_id) in ids


@requires_db
@pytest.mark.parametrize("platform_email", PLATFORM_EMAILS)
def test_owner_does_not_see_platform_admin_in_team(client, platform_email):
    _as(client, OWNER, "owner@example.com")
    _create_restaurant(client, name="Tacos", subdomain="hidden-plat")

    _as(client, PLATFORM_ADMIN, platform_email)
    me = client.get("/api/v1/restaurants/me", headers=AUTH)
    assert me.status_code == 200
    assert me.json()["member_role"] == "admin"

    _as(client, OWNER, "owner@example.com")
    members = client.get("/api/v1/restaurants/me/members", headers=AUTH)
    assert members.status_code == 200, members.text
    emails = {row["email"] for row in members.json() if row["email"]}
    assert platform_email not in emails
    assert all(row["member_role"] == "owner" for row in members.json())

    invites = client.get("/api/v1/restaurants/me/admin-invites", headers=AUTH)
    assert invites.status_code == 200
    assert invites.json() == []


@requires_db
@pytest.mark.parametrize("platform_email", PLATFORM_EMAILS)
def test_owner_cannot_invite_platform_admin_email(client, engine, platform_email):
    _as(client, OWNER, "owner@example.com")
    _create_restaurant(client, name="Tacos", subdomain="invite-plat")

    blocked = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": platform_email},
        headers=AUTH,
    )
    assert blocked.status_code == 409

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        invite = session.scalar(select(RestaurantAdminInvite.id))
        assert invite is None


@requires_db
def test_owner_can_still_invite_regular_admins(client):
    _as(client, OWNER, "owner@example.com")
    _create_restaurant(client, name="Tacos", subdomain="regular-plat")

    created = client.post(
        "/api/v1/restaurants/me/admin-invites",
        json={"email": "admin.equipo@empresa.com"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    assert created.json()["email"] == "admin.equipo@empresa.com"


@requires_db
def test_stranger_still_has_no_restaurant_access(client):
    _as(client, OWNER, "owner@example.com")
    restaurant_id = _create_restaurant(client, name="Tacos", subdomain="stranger-plat")

    _as(client, STRANGER, "random.user@example.com")
    me = client.get("/api/v1/restaurants/me", headers=AUTH)
    assert me.status_code == 200
    assert me.json()["restaurant"] is None

    forbidden = client.get(f"/api/v1/restaurants/{restaurant_id}", headers=AUTH)
    assert forbidden.status_code == 403


@requires_db
@pytest.mark.parametrize("platform_email", PLATFORM_EMAILS)
def test_platform_admin_does_not_gain_delivery_provider_access(client, platform_email):
    _as(client, OWNER, "owner@example.com")
    _create_restaurant(client, name="Tacos", subdomain="delivery-plat")

    _as(client, PLATFORM_ADMIN, platform_email)
    me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
    assert me.status_code == 200, me.text
    assert me.json()["provider"] is None
    assert me.json()["member_role"] is None
