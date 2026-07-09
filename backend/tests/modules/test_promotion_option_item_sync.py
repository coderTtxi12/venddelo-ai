from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.menu.schemas import CategoryCreate, OptionGroupCreate, OptionItemCreate, ProductCreate
from app.modules.promotions.option_item_sync import sync_option_items_for_product_change
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_sync_option_items_adds_complements_for_new_product(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Sync", subdomain="promo-sync-unit")
    )
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
        OptionGroupCreate(
            title="Tamaño",
            items=[
                OptionItemCreate(label="12 piezas"),
                OptionItemCreate(label="24 piezas", price_delta_cents=5000),
            ],
        ),
    )
    boneless_items = [item.id for item in boneless_group.items]

    synced = sync_option_items_for_product_change(
        uow.menu,
        restaurant.id,
        previous_product_ids=[burger.id],
        new_product_ids=[burger.id, boneless.id],
        current_option_item_ids=[burger_item.id],
    )

    assert burger_item.id in synced
    assert all(item_id in synced for item_id in boneless_items)


@requires_db
def test_sync_option_items_repairs_missing_complements_without_product_change(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Repair", subdomain="promo-repair-sync")
    )
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

    synced = sync_option_items_for_product_change(
        uow.menu,
        restaurant.id,
        previous_product_ids=[burger.id, boneless.id],
        new_product_ids=[burger.id, boneless.id],
        current_option_item_ids=[burger_item.id],
    )

    assert boneless_item.id in synced


@requires_db
def test_sync_option_items_adds_complements_when_product_added(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Targets", subdomain="promo-targets-sync")
    )
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
            name="BONELESS & FRIES",
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
        OptionGroupCreate(
            title="Tamaño",
            items=[OptionItemCreate(label="12 piezas")],
        ),
    )
    boneless_item = boneless_group.items[0]

    synced = sync_option_items_for_product_change(
        uow.menu,
        restaurant.id,
        previous_product_ids=[burger.id],
        new_product_ids=[burger.id, boneless.id],
        current_option_item_ids=[burger_item.id],
    )

    assert burger_item.id in synced
    assert boneless_item.id in synced
