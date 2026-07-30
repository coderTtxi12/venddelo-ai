import uuid

from sqlalchemy import select

from app.db.models.menu import Category, OptionGroup, OptionItem, Product, product_categories
from app.db.models.orders import OrderItem
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.api import router as menu_router
from app.modules.menu.schemas import (
    CategoryCreate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
)
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.orders.schemas import OrderCreate, OrderItemCreate
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


@requires_db
def test_hard_delete_product_removes_row_and_option_groups(session):
    restaurant = _restaurant(session, "hd-prod-1")
    repo = SqlAlchemyMenuRepository(session)
    category = repo.add_category(CategoryCreate(restaurant_id=restaurant.id, name="C"))
    product = repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Burger",
            price_cents=1000,
            category_ids=[category.id],
            status="active",
        )
    )
    group = repo.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Size",
            selection="single",
            items=[OptionItemCreate(label="L", price_delta_cents=0)],
        ),
    )
    item_id = group.items[0].id

    assert repo.hard_delete_product(product.id) is True

    assert repo.get_product_by_id(product.id) is None
    assert session.get(Product, product.id) is None
    assert session.get(OptionGroup, group.id) is None
    assert session.get(OptionItem, item_id) is None


@requires_db
def test_hard_delete_category_keeps_products(session):
    restaurant = _restaurant(session, "hd-cat-1")
    repo = SqlAlchemyMenuRepository(session)
    category = repo.add_category(CategoryCreate(restaurant_id=restaurant.id, name="C"))
    product = repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Burger",
            price_cents=1000,
            category_ids=[category.id],
            status="active",
        )
    )

    assert repo.hard_delete_category(category.id) is True

    assert session.get(Category, category.id) is None
    assert session.get(Product, product.id) is not None
    links = session.execute(
        select(product_categories.c.product_id).where(
            product_categories.c.category_id == category.id
        )
    ).all()
    assert links == []


@requires_db
def test_hard_delete_missing_returns_false(session):
    repo = SqlAlchemyMenuRepository(session)
    missing = uuid.uuid4()

    assert repo.hard_delete_category(missing) is False
    assert repo.hard_delete_product(missing) is False


def test_permanent_delete_routes_return_no_content():
    routes = {
        (route.path, frozenset(route.methods or set())): route.status_code
        for route in menu_router.routes
    }

    assert (
        routes[
            (
                "/restaurants/{restaurant_id}/categories/{category_id}/permanent",
                frozenset({"DELETE"}),
            )
        ]
        == 204
    )
    assert (
        routes[
            (
                "/restaurants/{restaurant_id}/products/{product_id}/permanent",
                frozenset({"DELETE"}),
            )
        ]
        == 204
    )


@requires_db
def test_hard_delete_product_keeps_order_item_and_sets_product_null(session):
    restaurant = _restaurant(session, "hd-prod-order-1")
    menu_repo = SqlAlchemyMenuRepository(session)
    category = menu_repo.add_category(CategoryCreate(restaurant_id=restaurant.id, name="C"))
    product = menu_repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Burger",
            price_cents=1000,
            category_ids=[category.id],
            status="active",
        )
    )
    order = SqlAlchemyOrderRepository(session).add(
        OrderCreate(
            restaurant_id=restaurant.id,
            type="delivery",
            customer_name="Juan",
            customer_phone="555",
            payment_method="cash",
            subtotal_cents=1000,
            total_cents=1000,
            items=[
                OrderItemCreate(
                    product_id=product.id,
                    product_name=product.name,
                    quantity=1,
                    unit_price_cents=1000,
                    line_total_cents=1000,
                )
            ],
        )
    )
    order_item_id = order.items[0].id

    assert menu_repo.hard_delete_product(product.id) is True
    session.expire_all()

    order_item = session.get(OrderItem, order_item_id)
    assert order_item is not None
    assert order_item.product_id is None
