from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.orders.schemas import OrderCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.api.test_api_v1 import AUTH
from tests.conftest import requires_db


def _seed_customers(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Clientes", subdomain=subdomain),
            owner_id=OWNER,
        )
        uow.orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type="takeout",
                customer_name="María López",
                customer_phone="+525512345678",
                payment_method="cash",
                subtotal_cents=12000,
                total_cents=12000,
                status="delivered",
                items=[],
            )
        )
        uow.orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type="delivery",
                customer_name="Maria",
                customer_phone="5512345678",
                payment_method="cash",
                subtotal_cents=8000,
                total_cents=8000,
                status="pending",
                items=[],
            )
        )
        restaurant_id = restaurant.id
        uow.commit()
    return restaurant_id


@requires_db
def test_list_restaurant_customers_groups_by_phone(client, engine):
    restaurant_id = _seed_customers(engine, "api-cust-1")

    response = client.get(
        f"/api/v1/restaurants/{restaurant_id}/customers",
        headers=AUTH,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stats"]["unique_customers"] == 1
    assert body["stats"]["repeat_customers"] == 1
    assert body["total"] == 1
    assert len(body["items"]) == 1
    customer = body["items"][0]
    assert customer["phone_key"] == "5512345678"
    assert customer["order_count"] == 2
    assert customer["total_spent_cents"] == 12000
    assert "menu" in customer["sources"]


@requires_db
def test_customer_activity_endpoint(client, engine):
    restaurant_id = _seed_customers(engine, "api-cust-2")

    response = client.get(
        f"/api/v1/restaurants/{restaurant_id}/customers/5512345678/activity",
        headers=AUTH,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["phone_key"] == "5512345678"
    assert len(body["items"]) == 2
    assert body["total"] == 2
    assert body["has_more"] is False
    assert body["summary"]["menu_count"] == 2
    assert len(body["summary"]["timeline"]) == 2
    assert {item["kind"] for item in body["items"]} == {"menu"}


@requires_db
def test_customer_activity_endpoint_pagination(client, engine):
    restaurant_id = _seed_customers(engine, "api-cust-3")
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.get(restaurant_id)
        assert restaurant is not None
        for cents in (3000, 4000, 5000):
            uow.orders.add(
                OrderCreate(
                    restaurant_id=restaurant.id,
                    type="takeout",
                    customer_name="María López",
                    customer_phone="+525512345678",
                    payment_method="cash",
                    subtotal_cents=cents,
                    total_cents=cents,
                    status="delivered",
                    items=[],
                )
            )
        uow.commit()

    response = client.get(
        f"/api/v1/restaurants/{restaurant_id}/customers/5512345678/activity?limit=2&sort=amount-desc",
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 2
    assert body["total"] >= 2
    assert body["has_more"] is True
    assert body["next_cursor"]
