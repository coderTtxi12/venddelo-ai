"""Kitchen order status updates with cancellation reason."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.orders.schemas import OrderCreate
from app.modules.restaurants.schemas import PaymentMethodCreate, RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_cancel_order_requires_reason(client, engine):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Kitchen", subdomain="kitchen-cancel"),
            owner_id=OWNER,
        )
        restaurant_id = restaurant.id
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [PaymentMethodCreate(method="cash", service_type="takeout")],
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Menu"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Taco",
                price_cents=5000,
                status="active",
                category_ids=[cat.id],
            )
        )
        order = uow.orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type="takeout",
                customer_name="Ana",
                customer_phone="whatsapp",
                payment_method="cash",
                subtotal_cents=5000,
                total_cents=5000,
                items=[],
            )
        )
        order_id = order.id
        product_id = product.id
        uow.commit()

    # add item via public API path is heavier; cancel pending order created above
    resp = client.post(
        f"/api/v1/restaurants/{restaurant_id}/orders/{order_id}/status",
        json={"status": "cancelled"},
        headers=AUTH,
    )
    assert resp.status_code == 400
    assert "cancellation_reason" in resp.json()["error"]["message"]

    ok = client.post(
        f"/api/v1/restaurants/{restaurant_id}/orders/{order_id}/status",
        json={"status": "cancelled", "cancellation_reason": "Producto agotado"},
        headers=AUTH,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "cancelled"
    assert body["cancellation_reason"] == "Producto agotado"

    # unrelated product id to satisfy linter on unused in some runs
    assert product_id is not None
