from __future__ import annotations

import uuid

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.coupons.schemas import CouponCreate
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import PaymentMethodCreate, RestaurantCreate
from tests.api.conftest import OWNER
from tests.api.test_api_v1 import AUTH
from tests.conftest import requires_db


def _seed_quote_coupon_fixture(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Quote Coupons", subdomain=subdomain, status="published"),
            owner_id=OWNER,
        )
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [
                PaymentMethodCreate(method="cash", service_type="takeout"),
                PaymentMethodCreate(method="cash", service_type="delivery"),
            ],
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Pizzas"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Margherita",
                price_cents=10000,
                status="active",
                category_ids=[cat.id],
            )
        )
        uow.coupons.add(
            CouponCreate(
                restaurant_id=restaurant.id,
                code="PIZZA20",
                name="20% off",
                type="percent",
                percent=20,
                scope="all",
            )
        )
        uow.commit()
        return restaurant.id, product.id


def _seed_free_shipping_coupon(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Free Ship", subdomain=subdomain),
            owner_id=OWNER,
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Pizzas"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Margherita",
                price_cents=10000,
                status="active",
                category_ids=[cat.id],
            )
        )
        uow.coupons.add(
            CouponCreate(
                restaurant_id=restaurant.id,
                code="FREESHIP",
                name="Free delivery",
                type="free_shipping",
                scope="all",
            )
        )
        uow.commit()
        return product.id


@requires_db
def test_public_cart_quote_applies_percent_coupon(client, engine):
    _, product_id = _seed_quote_coupon_fixture(engine, "quote-coupon-ok")
    resp = client.post(
        "/api/v1/public/restaurants/quote-coupon-ok/cart/quote",
        json={
            "items": [{"product_id": str(product_id), "quantity": 1}],
            "coupon_code": "PIZZA20",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["coupon"]["code"] == "PIZZA20"
    assert body["coupon"]["discount_cents"] == 2000
    assert body["total_cents"] == 8000
    assert body["coupon_error"] is None


@requires_db
def test_public_cart_quote_bad_coupon_returns_error(client, engine):
    _, product_id = _seed_quote_coupon_fixture(engine, "quote-coupon-bad")
    resp = client.post(
        "/api/v1/public/restaurants/quote-coupon-bad/cart/quote",
        json={
            "items": [{"product_id": str(product_id), "quantity": 1}],
            "coupon_code": "NOPE",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["coupon"] is None
    assert body["coupon_error"]["code"] == "coupon_not_found"
    assert body["total_cents"] == 10000


@requires_db
def test_public_cart_quote_free_shipping_takeout_is_delivery_only(client, engine):
    product_id = _seed_free_shipping_coupon(engine, "quote-coupon-ship")
    resp = client.post(
        "/api/v1/public/restaurants/quote-coupon-ship/cart/quote",
        json={
            "items": [{"product_id": str(product_id), "quantity": 1}],
            "coupon_code": "FREESHIP",
            "service_type": "takeout",
            "delivery_fee_cents": 4500,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["coupon"] is None
    assert body["coupon_error"]["code"] == "coupon_delivery_only"
    assert body["total_cents"] == 10000
    assert body["delivery_fee_cents"] == 4500


def _order_body(product_id: uuid.UUID) -> dict:
    return {
        "type": "takeout",
        "customer_name": "Ana",
        "customer_phone": "+525512345678",
        "payment_method": "cash",
        "items": [{"product_id": str(product_id), "quantity": 1}],
    }


@requires_db
def test_public_order_snapshots_valid_coupon(client, engine):
    _, product_id = _seed_quote_coupon_fixture(engine, "order-coupon-ok")
    resp = client.post(
        "/api/v1/public/menu/order-coupon-ok/orders",
        json={**_order_body(product_id), "coupon_code": "PIZZA20"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["applied_coupon_code"] == "PIZZA20"
    assert body["coupon_discount_cents"] == 2000
    assert body["total_cents"] == 8000
    labels = [entry["label"] for entry in body["applied_order_discounts"]]
    assert any(label.startswith("Cupón PIZZA20") for label in labels)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        count = uow.coupons.redemption_count(
            uuid.UUID(body["applied_coupon_id"]),
        )
        uow.commit()
    assert count == 0


@requires_db
def test_public_order_rejects_unknown_coupon(client, engine):
    _, product_id = _seed_quote_coupon_fixture(engine, "order-coupon-bad")
    resp = client.post(
        "/api/v1/public/menu/order-coupon-bad/orders",
        json={**_order_body(product_id), "coupon_code": "NOPE"},
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "coupon_not_found"
