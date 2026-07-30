import uuid

from pydantic import ValidationError as PydanticValidationError

from app.db.models.menu import OptionGroup, Product
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.api import router as menu_router
from app.modules.menu.schemas import (
    CategoryCreate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
    ProductPermanentBulkDelete,
)
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


def test_product_permanent_bulk_delete_schema_rejects_empty():
    try:
        ProductPermanentBulkDelete(product_ids=[])
        raise AssertionError("expected validation error")
    except PydanticValidationError:
        pass


def test_product_permanent_bulk_delete_schema_rejects_over_max():
    ids = [uuid.uuid4() for _ in range(21)]
    try:
        ProductPermanentBulkDelete(product_ids=ids)
        raise AssertionError("expected validation error")
    except PydanticValidationError:
        pass


def test_permanent_bulk_route_returns_no_content():
    routes = {
        (route.path, frozenset(route.methods or set())): route.status_code
        for route in menu_router.routes
    }
    assert (
        routes[
            (
                "/restaurants/{restaurant_id}/products/permanent-bulk",
                frozenset({"POST"}),
            )
        ]
        == 204
    )


@requires_db
def test_hard_delete_products_removes_all(session):
    restaurant = _restaurant(session, "bulk-hd-1")
    repo = SqlAlchemyMenuRepository(session)
    category = repo.add_category(CategoryCreate(restaurant_id=restaurant.id, name="C"))
    p1 = repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="A",
            price_cents=100,
            category_ids=[category.id],
            status="active",
        )
    )
    p2 = repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="B",
            price_cents=200,
            category_ids=[category.id],
            status="active",
        )
    )
    group = repo.add_option_group(
        p1.id,
        OptionGroupCreate(
            title="Size",
            selection="single",
            items=[OptionItemCreate(label="L", price_delta_cents=0)],
        ),
    )

    assert repo.hard_delete_products([p1.id, p2.id]) == 2
    assert session.get(Product, p1.id) is None
    assert session.get(Product, p2.id) is None
    assert session.get(OptionGroup, group.id) is None
