import uuid

from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.uow import SqlAlchemyUnitOfWork
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
    idempotency_key = str(uuid.uuid4())
    headers = {"Idempotency-Key": idempotency_key}
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


@requires_db
def test_restaurant_description_patch_and_public(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        dto = uow.restaurants.add(
            RestaurantCreate(
                name="Desc Rest",
                subdomain="desc-rest",
                status="published",
                description="Tacos desde 1985",
            ),
            owner_id=OWNER,
        )
        uow.commit()

    get_resp = client.get(f"/api/v1/restaurants/{dto.id}", headers=AUTH)
    assert get_resp.status_code == 200
    assert get_resp.json()["description"] == "Tacos desde 1985"

    patch_resp = client.patch(
        f"/api/v1/restaurants/{dto.id}",
        json={"description": "Nueva descripción"},
        headers=AUTH,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["description"] == "Nueva descripción"

    public_resp = client.get("/api/v1/public/restaurants/desc-rest")
    assert public_resp.status_code == 200
    assert public_resp.json()["description"] == "Nueva descripción"


@requires_db
def test_restaurant_subdomain_patch_and_check(client):
    first_resp = client.post(
        "/api/v1/restaurants",
        json={"name": "First", "subdomain": "first-rest"},
        headers=AUTH,
    )
    assert first_resp.status_code == 201
    second_resp = client.post(
        "/api/v1/restaurants",
        json={"name": "Second", "subdomain": "second-rest"},
        headers=AUTH,
    )
    assert second_resp.status_code == 201
    second_id = second_resp.json()["id"]
    taken_resp = client.get(
        "/api/v1/restaurants/check-subdomain",
        params={"subdomain": "first-rest", "exclude": second_id},
        headers=AUTH,
    )
    assert taken_resp.status_code == 200
    assert taken_resp.json()["available"] is False

    own_resp = client.get(
        "/api/v1/restaurants/check-subdomain",
        params={"subdomain": "second-rest", "exclude": second_id},
        headers=AUTH,
    )
    assert own_resp.status_code == 200
    assert own_resp.json()["available"] is True

    free_resp = client.get(
        "/api/v1/restaurants/check-subdomain",
        params={"subdomain": "wild-rooster"},
        headers=AUTH,
    )
    assert free_resp.status_code == 200
    assert free_resp.json()["available"] is True

    conflict_resp = client.patch(
        f"/api/v1/restaurants/{second_id}",
        json={"subdomain": "first-rest"},
        headers=AUTH,
    )
    assert conflict_resp.status_code == 409

    patch_resp = client.patch(
        f"/api/v1/restaurants/{second_id}",
        json={"subdomain": "wild-rooster"},
        headers=AUTH,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["subdomain"] == "wild-rooster"
