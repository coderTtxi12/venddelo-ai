from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.restaurants.schemas import RestaurantCreate
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
    assert body["redeemed_count"] == 0
    listed = client.get(f"/api/v1/restaurants/{restaurant_id}/coupons", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["code"] == "PIZZA20"


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
