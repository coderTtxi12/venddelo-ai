"""Integration tests: live-menu checkout order persists with full details + restaurant."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.menu.schemas import (
    CategoryCreate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
)
from app.modules.restaurants.schemas import PaymentMethodCreate, RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_public_live_menu_order_persists_all_details(client, engine):
    """Mirrors frontend buildPublicOrderInput + submitPublicOrderBackground payload."""
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    subdomain = "wildrooster-live"
    group_id: uuid.UUID
    option_id: uuid.UUID
    product_id: uuid.UUID
    restaurant_id: uuid.UUID

    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(
                name="Wild Rooster",
                subdomain=subdomain,
                status="published",
                takeout_enabled=True,
                delivery_enabled=True,
            ),
            owner_id=OWNER,
        )
        restaurant_id = restaurant.id
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [
                PaymentMethodCreate(method="cash", service_type="delivery"),
                PaymentMethodCreate(method="cash", service_type="takeout"),
            ],
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Burgers"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="BURGER & BONELESS",
                price_cents=25900,
                approval_status="approved",
                is_published=True,
                category_ids=[cat.id],
            )
        )
        product_id = product.id
        group = uow.menu.add_option_group(
            product.id,
            OptionGroupCreate(
                title="Salsa",
                selection="single",
                required=False,
                items=[OptionItemCreate(label="Habanero", price_delta_cents=0)],
            ),
        )
        group_id = group.id
        option_id = group.items[0].id
        uow.commit()

    delivery_address = (
        "Tultepec, State of Mexico, Mexico\n"
        "Referencias: casa blanca, puerta de madera"
    )
    order_ref = "A1B2C3D4"
    idempotency_key = str(uuid.uuid4())

    order_body = {
        "type": "delivery",
        "customer_name": "Oliver",
        "customer_phone": "whatsapp",
        "payment_method": "cash",
        "delivery_address": delivery_address,
        "delivery_fee_cents": 5000,
        "note": f"Ref. pedido #{order_ref} | BURGER & BONELESS: sin cebolla",
        "items": [
            {
                "product_id": str(product_id),
                "quantity": 1,
                "selected_options": {str(group_id): [str(option_id)]},
            }
        ],
    }

    create_resp = client.post(
        f"/api/v1/public/menu/{subdomain}/orders",
        json=order_body,
        headers={"Idempotency-Key": idempotency_key},
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()

    assert created["restaurant_id"] == str(restaurant_id)
    assert created["type"] == "delivery"
    assert created["customer_name"] == "Oliver"
    assert created["customer_phone"] == "whatsapp"
    assert created["payment_method"] == "cash"
    assert created["delivery_address"] == delivery_address
    assert created["note"] == order_body["note"]
    assert created["status"] == "pending"
    assert created["idempotency_key"] == idempotency_key
    assert created["delivery_fee_cents"] == 5000
    assert created["total_cents"] > 25900
    assert len(created["items"]) == 1

    item = created["items"][0]
    assert item["product_id"] == str(product_id)
    assert item["product_name"] == "BURGER & BONELESS"
    assert item["quantity"] == 1
    assert item["selected_options"] == {str(group_id): [str(option_id)]}
    assert item["line_total_cents"] > 0

    list_resp = client.get(
        f"/api/v1/restaurants/{restaurant_id}/orders",
        headers=AUTH,
    )
    assert list_resp.status_code == 200
    listed = list_resp.json()["items"]
    assert any(row["id"] == created["id"] for row in listed)

    get_resp = client.get(
        f"/api/v1/restaurants/{restaurant_id}/orders/{created['id']}",
        headers=AUTH,
    )
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["restaurant_id"] == str(restaurant_id)
    assert fetched["delivery_address"] == delivery_address
    assert fetched["items"][0]["selected_options"] == {str(group_id): [str(option_id)]}

    # Idempotent replay returns same order
    replay = client.post(
        f"/api/v1/public/menu/{subdomain}/orders",
        json=order_body,
        headers={"Idempotency-Key": idempotency_key},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == created["id"]


@requires_db
def test_public_live_menu_order_allowed_for_draft_restaurant(client, engine):
    """Draft restaurants can receive orders when the public menu is already reachable."""
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    subdomain = "wildrooster-draft"

    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(
                name="Wild Rooster Draft",
                subdomain=subdomain,
                status="draft",
                takeout_enabled=True,
                delivery_enabled=False,
            ),
            owner_id=OWNER,
        )
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [PaymentMethodCreate(method="cash", service_type="takeout")],
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Burgers"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Burger",
                price_cents=10000,
                approval_status="approved",
                is_published=True,
                category_ids=[cat.id],
            )
        )
        product_id = product.id
        uow.commit()

    resp = client.post(
        f"/api/v1/public/menu/{subdomain}/orders",
        json={
            "type": "takeout",
            "customer_name": "Oliver",
            "customer_phone": "whatsapp",
            "payment_method": "cash",
            "items": [{"product_id": str(product_id), "quantity": 1}],
        },
    )
    assert resp.status_code == 201, resp.text


@requires_db
def test_public_live_menu_order_rejected_when_restaurant_suspended(client, engine):
    me = client.get("/api/v1/users/me", headers=AUTH)
    assert me.status_code == 200

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    subdomain = "wildrooster-suspended"

    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(
                name="Wild Rooster Suspended",
                subdomain=subdomain,
                status="suspended",
                takeout_enabled=True,
            ),
            owner_id=OWNER,
        )
        uow.restaurants.set_payment_methods(
            restaurant.id,
            [PaymentMethodCreate(method="cash", service_type="takeout")],
        )
        cat = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Burgers"),
        )
        product = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Burger",
                price_cents=10000,
                approval_status="approved",
                is_published=True,
                category_ids=[cat.id],
            )
        )
        product_id = product.id
        uow.commit()

    resp = client.post(
        f"/api/v1/public/menu/{subdomain}/orders",
        json={
            "type": "takeout",
            "customer_name": "Oliver",
            "customer_phone": "whatsapp",
            "payment_method": "cash",
            "items": [{"product_id": str(product_id), "quantity": 1}],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["message"] == "Restaurant is not accepting orders"
