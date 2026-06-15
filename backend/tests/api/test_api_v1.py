import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.main import app
from app.modules.menu.schemas import (
    CategoryCreate,
    ProductCreate,
)
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
)
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
OTHER = uuid.UUID("22222222-2222-2222-2222-222222222222")


class FakeAuth(AuthPort):
    def __init__(self, user_id: uuid.UUID = OWNER) -> None:
        self._user_id = user_id

    def verify_token(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            from app.core.exceptions import UnauthorizedError

            raise UnauthorizedError("Invalid token")
        return AuthenticatedUser(id=self._user_id, email="test@example.com")


@requires_db
@pytest.fixture
def client(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_uow() -> Iterator[SqlAlchemyUnitOfWork]:
        with SqlAlchemyUnitOfWork(factory) as uow:
            yield uow
            uow.commit()

    app.dependency_overrides[get_uow] = override_uow
    app.dependency_overrides[get_auth] = lambda: FakeAuth()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_create_and_get_restaurant(client):
    resp = client.post(
        "/api/v1/restaurants",
        json={"name": "Tacos", "subdomain": "tacos-api"},
        headers=AUTH,
    )
    assert resp.status_code == 201
    rid = resp.json()["id"]
    get_resp = client.get(f"/api/v1/restaurants/{rid}", headers=AUTH)
    assert get_resp.status_code == 200
    assert get_resp.json()["subdomain"] == "tacos-api"


@requires_db
def test_unauthorized_without_token(client):
    resp = client.get("/api/v1/restaurants")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


@requires_db
def test_forbidden_for_non_owner(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        dto = uow.restaurants.add(
            RestaurantCreate(name="X", subdomain="owned"),
            owner_id=OTHER,
        )
        uow.commit()
    app.dependency_overrides[get_auth] = lambda: FakeAuth(OWNER)
    resp = client.get(f"/api/v1/restaurants/{dto.id}", headers=AUTH)
    assert resp.status_code == 403


@requires_db
def test_public_menu_and_order(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        r = uow.restaurants.add(
            RestaurantCreate(name="Pub", subdomain="pubmenu", status="published"),
            owner_id=OWNER,
        )
        uow.restaurants.set_payment_methods(
            r.id,
            [PaymentMethodCreate(method="cash", service_type="takeout")],
        )
        cat = uow.menu.add_category(CategoryCreate(restaurant_id=r.id, name="Main"))
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=r.id,
                name="Taco",
                price_cents=500,
                approval_status="approved",
                is_published=True,
                category_ids=[cat.id],
            )
        )
        uow.commit()

    menu_resp = client.get("/api/v1/public/menu/pubmenu")
    assert menu_resp.status_code == 200
    assert len(menu_resp.json()["products"]) == 1

    order_body = {
        "type": "takeout",
        "customer_name": "Ana",
        "customer_phone": "555",
        "payment_method": "cash",
        "items": [{"product_id": menu_resp.json()["products"][0]["id"], "quantity": 2}],
    }
    headers = {"Idempotency-Key": "key-1"}
    o1 = client.post(
        "/api/v1/public/menu/pubmenu/orders",
        json=order_body,
        headers=headers,
    )
    assert o1.status_code == 201
    assert o1.json()["total_cents"] == 1000
    o2 = client.post(
        "/api/v1/public/menu/pubmenu/orders",
        json=order_body,
        headers=headers,
    )
    assert o2.status_code == 201
    assert o2.json()["id"] == o1.json()["id"]
