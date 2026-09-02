from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.coupons.schemas import CouponCreate
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import PaymentMethodCreate, RestaurantCreate
from tests.api.conftest import OWNER
from tests.api.test_api_v1 import AUTH
from tests.conftest import requires_db


def _seed(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Cupones", subdomain=subdomain),
            owner_id=OWNER,
        )
        uow.commit()
        return restaurant.id


@requires_db
def test_create_list_coupon_normalizes_code(client, engine):
    restaurant_id = _seed(engine, "api-coupon-1")
    created = client.post(
        f"/api/v1/restaurants/{restaurant_id}/coupons",
        headers=AUTH,
        json={
            "code": " pizza20 ",
            "name": "20% pizzas",
            "type": "percent",
            "percent": 20,
            "scope": "all",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["code"] == "PIZZA20"
    assert body["effective_status"] == "active"
    assert body["recurrence_weekdays"] is None
    assert body["redeemed_count"] == 0
    listed = client.get(f"/api/v1/restaurants/{restaurant_id}/coupons", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["code"] == "PIZZA20"


@requires_db
def test_create_coupon_with_weekdays(client, engine):
    restaurant_id = _seed(engine, "api-coupon-weekdays")
    created = client.post(
        f"/api/v1/restaurants/{restaurant_id}/coupons",
        headers=AUTH,
        json={
            "code": "LUNES",
            "name": "Solo lunes",
            "type": "percent",
            "percent": 10,
            "scope": "all",
            "recurrence_weekdays": [0, 2],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["recurrence_weekdays"] == [0, 2]


@requires_db
def test_create_coupon_with_starts_on(client, engine):
    restaurant_id = _seed(engine, "api-coupon-starts")
    created = client.post(
        f"/api/v1/restaurants/{restaurant_id}/coupons",
        headers=AUTH,
        json={
            "code": "FUTURO",
            "name": "Próximo",
            "type": "percent",
            "percent": 10,
            "scope": "all",
            "starts_on": "2026-12-01",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["starts_on"] == "2026-12-01"
    assert body["effective_status"] == "scheduled"


@requires_db
def test_duplicate_code_conflict(client, engine):
    restaurant_id = _seed(engine, "api-coupon-2")
    payload = {
        "code": "SAVE10",
        "name": "Diez",
        "type": "amount",
        "amount_cents": 1000,
        "scope": "all",
    }
    assert client.post(f"/api/v1/restaurants/{restaurant_id}/coupons", headers=AUTH, json=payload).status_code == 201
    dup = client.post(f"/api/v1/restaurants/{restaurant_id}/coupons", headers=AUTH, json=payload)
    assert dup.status_code == 409


@requires_db
def test_list_coupons_pagination(client, engine):
    restaurant_id = _seed(engine, "api-coupon-page")
    for index in range(3):
        response = client.post(
            f"/api/v1/restaurants/{restaurant_id}/coupons",
            headers=AUTH,
            json={
                "code": f"PAGE{index}",
                "name": f"Cupón {index}",
                "type": "amount",
                "amount_cents": 1000,
                "scope": "all",
            },
        )
        assert response.status_code == 201, response.text

    page_one = client.get(
        f"/api/v1/restaurants/{restaurant_id}/coupons?limit=2",
        headers=AUTH,
    )
    assert page_one.status_code == 200, page_one.text
    body_one = page_one.json()
    assert len(body_one["items"]) == 2
    assert body_one["has_more"] is True
    assert body_one["next_cursor"]

    page_two = client.get(
        f"/api/v1/restaurants/{restaurant_id}/coupons?limit=2&cursor={body_one['next_cursor']}",
        headers=AUTH,
    )
    assert page_two.status_code == 200, page_two.text
    body_two = page_two.json()
    assert len(body_two["items"]) == 1
    assert body_two["has_more"] is False
    assert body_two["next_cursor"] is None


@requires_db
def test_list_coupon_applications(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Apps", subdomain="coupon-apps", status="published"),
            owner_id=OWNER,
        )
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [PaymentMethodCreate(method="cash", service_type="takeout")],
        )
        cat = uow.menu.add_category(CategoryCreate(restaurant_id=restaurant.id, name="Pizzas"))
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Margherita",
                price_cents=10000,
                status="active",
                category_ids=[cat.id],
            )
        )
        coupon = uow.coupons.add(
            CouponCreate(
                restaurant_id=restaurant.id,
                code="SAVE5",
                name="Cinco",
                type="amount",
                amount_cents=500,
                scope="all",
            )
        )
        uow.commit()
        restaurant_id = restaurant.id
        product_id = product.id
        coupon_id = coupon.id

    order = client.post(
        "/api/v1/public/menu/coupon-apps/orders",
        json={
            "type": "takeout",
            "customer_name": "María López",
            "customer_phone": "+525512345678",
            "payment_method": "cash",
            "items": [{"product_id": str(product_id), "quantity": 1}],
            "coupon_code": "SAVE5",
        },
    )
    assert order.status_code == 201, order.text

    listed = client.get(
        f"/api/v1/restaurants/{restaurant_id}/coupons/{coupon_id}/applications",
        headers=AUTH,
    )
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["has_more"] is False
    assert len(body["items"]) == 1
    assert body["items"][0]["customer_name"] == "María López"
    assert body["items"][0]["customer_phone"] == "+525512345678"
    assert body["items"][0]["status"] == "pending"
    assert body["items"][0]["redeemed"] is False
    assert body["items"][0]["coupon_discount_cents"] == 500
