import uuid

import pytest

from app.core.exceptions import ValidationError
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.menu.schemas import CategoryCreate, OptionGroupCreate, OptionItemCreate, ProductCreate
from app.modules.promotions.option_item_sync import (
    add_products_to_nxm_promo,
    disable_complements_in_nxm_promo,
    enable_complements_in_nxm_promo,
    remove_products_from_nxm_promo,
)
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _burger_fixtures(uow, *, subdomain: str):
    restaurant = uow.restaurants.add(RestaurantCreate(name="NxM Patch", subdomain=subdomain))
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=0)
    )
    burger = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            price_cents=5000,
            category_ids=[category.id],
        )
    )
    boneless = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    burger_group = uow.menu.add_option_group(
        burger.id,
        OptionGroupCreate(title="Salsa", items=[OptionItemCreate(label="BBQ")]),
    )
    burger_item = burger_group.items[0]
    boneless_group = uow.menu.add_option_group(
        boneless.id,
        OptionGroupCreate(title="Tamaño", items=[OptionItemCreate(label="12 piezas")]),
    )
    boneless_item = boneless_group.items[0]
    return restaurant, burger, boneless, burger_item, boneless_item


@requires_db
def test_add_products_appends_complements_to_allow_list(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, boneless, burger_item, boneless_item = _burger_fixtures(
        uow, subdomain="nxm-add-explicit"
    )

    products, options = add_products_to_nxm_promo(
        uow.menu,
        restaurant.id,
        current_product_ids=[burger.id],
        add_product_ids=[boneless.id],
        current_option_item_ids=[burger_item.id],
    )

    assert products == sorted([burger.id, boneless.id])
    assert burger_item.id in options
    assert boneless_item.id in options


@requires_db
def test_add_products_from_empty_allow_list_adds_new_product_complements(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, boneless, _, boneless_item = _burger_fixtures(
        uow, subdomain="nxm-add-from-empty"
    )

    products, options = add_products_to_nxm_promo(
        uow.menu,
        restaurant.id,
        current_product_ids=[burger.id],
        add_product_ids=[boneless.id],
        current_option_item_ids=[],
    )

    assert boneless.id in products
    assert options == [boneless_item.id]


@requires_db
def test_remove_products_keeps_others_and_trims_allow_list(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, boneless, burger_item, boneless_item = _burger_fixtures(
        uow, subdomain="nxm-remove-restricted"
    )

    products, options = remove_products_from_nxm_promo(
        uow.menu,
        restaurant.id,
        current_product_ids=[burger.id, boneless.id],
        remove_product_ids=[boneless.id],
        current_option_item_ids=[burger_item.id, boneless_item.id],
    )

    assert products == [burger.id]
    assert burger_item.id in options
    assert boneless_item.id not in options


@requires_db
def test_remove_last_product_raises(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, _, _, _ = _burger_fixtures(uow, subdomain="nxm-remove-last")

    with pytest.raises(ValidationError, match="at least one product"):
        remove_products_from_nxm_promo(
            uow.menu,
            restaurant.id,
            current_product_ids=[burger.id],
            remove_product_ids=[burger.id],
            current_option_item_ids=[],
        )


@requires_db
def test_disable_complement_removes_from_allow_list(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, boneless, burger_item, boneless_item = _burger_fixtures(
        uow, subdomain="nxm-disable-explicit"
    )

    options = disable_complements_in_nxm_promo(
        uow.menu,
        restaurant.id,
        product_ids=[burger.id, boneless.id],
        current_option_item_ids=[burger_item.id, boneless_item.id],
        disable_option_item_ids=[boneless_item.id],
    )

    assert options == [burger_item.id]


@requires_db
def test_disable_from_empty_allow_list_is_noop(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, boneless, _, boneless_item = _burger_fixtures(
        uow, subdomain="nxm-disable-empty"
    )

    options = disable_complements_in_nxm_promo(
        uow.menu,
        restaurant.id,
        product_ids=[burger.id, boneless.id],
        current_option_item_ids=[],
        disable_option_item_ids=[boneless_item.id],
    )

    assert options == []


@requires_db
def test_enable_complement_adds_back_to_restricted_list(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant, burger, boneless, burger_item, boneless_item = _burger_fixtures(
        uow, subdomain="nxm-enable-restricted"
    )

    restricted = disable_complements_in_nxm_promo(
        uow.menu,
        restaurant.id,
        product_ids=[burger.id, boneless.id],
        current_option_item_ids=[burger_item.id, boneless_item.id],
        disable_option_item_ids=[boneless_item.id],
    )
    assert restricted == [burger_item.id]

    reenabled = enable_complements_in_nxm_promo(
        uow.menu,
        restaurant.id,
        product_ids=[burger.id, boneless.id],
        current_option_item_ids=restricted,
        enable_option_item_ids=[boneless_item.id],
    )
    assert reenabled == [burger_item.id, boneless_item.id]
