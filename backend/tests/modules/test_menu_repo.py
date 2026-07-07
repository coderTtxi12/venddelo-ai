from app.modules.menu.adapters import (
    SqlAlchemyMenuRepository,
    _category_sort_indices,
    _category_sort_indices_batch,
)
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryUpdate,
    OptionGroupCreate,
    OptionItemCreate,
    OptionItemUpdate,
    ProductCreate,
    ProductUpdate,
)
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    repo = SqlAlchemyRestaurantRepository(session)
    return repo.add(RestaurantCreate(name="R", subdomain=subdomain))


@requires_db
def test_category_crud_and_soft_delete(session):
    r = _restaurant(session, "menu1")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Tacos"))
    assert repo.get_category(cat.id).name == "Tacos"
    repo.update_category(cat.id, CategoryUpdate(name="Tacos2"))
    assert repo.get_category(cat.id).name == "Tacos2"
    assert repo.soft_delete_category(cat.id) is True
    assert repo.get_category(cat.id) is None


@requires_db
def test_product_with_two_categories(session):
    r = _restaurant(session, "menu2")
    repo = SqlAlchemyMenuRepository(session)
    c1 = repo.add_category(CategoryCreate(restaurant_id=r.id, name="A"))
    c2 = repo.add_category(CategoryCreate(restaurant_id=r.id, name="B"))
    prod = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="P",
            price_cents=1000,
            category_ids=[c1.id, c2.id],
        )
    )
    assert len(prod.category_ids) == 2
    loaded = repo.get_product(prod.id)
    assert set(loaded.category_ids) == {c1.id, c2.id}


@requires_db
def test_update_product_replaces_categories(session):
    r = _restaurant(session, "menu3")
    repo = SqlAlchemyMenuRepository(session)
    c1 = repo.add_category(CategoryCreate(restaurant_id=r.id, name="A"))
    c2 = repo.add_category(CategoryCreate(restaurant_id=r.id, name="B"))
    prod = repo.add_product(
        ProductCreate(restaurant_id=r.id, name="P", price_cents=1000, category_ids=[c1.id])
    )
    updated = repo.update_product(prod.id, ProductUpdate(category_ids=[c2.id]))
    assert updated.category_ids == [c2.id]


@requires_db
def test_option_group_with_items(session):
    r = _restaurant(session, "menu4")
    repo = SqlAlchemyMenuRepository(session)
    prod = repo.add_product(ProductCreate(restaurant_id=r.id, name="P", price_cents=1000))
    group = repo.add_option_group(
        prod.id,
        OptionGroupCreate(
            title="Size",
            selection="single",
            items=[
                OptionItemCreate(label="S", price_delta_cents=0),
                OptionItemCreate(label="L", price_delta_cents=500),
            ],
        ),
    )
    assert len(group.items) == 2
    loaded = repo.get_product(prod.id)
    assert len(loaded.option_groups) == 1
    assert len(loaded.option_groups[0].items) == 2


@requires_db
def test_full_menu_includes_inactive_published_products(session):
    r = _restaurant(session, "menu6")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Cat"))
    unavailable = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Unavailable",
            price_cents=1000,
            status="inactive",
            category_ids=[cat.id],
        )
    )
    repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Available",
            price_cents=1000,
            status="active",
            category_ids=[cat.id],
        )
    )
    menu = repo.get_full_menu(r.id)
    names = [p.name for p in menu.products]
    assert names == ["Available", "Unavailable"]


@requires_db
def test_set_category_product_order(session):
    r = _restaurant(session, "menu7")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Cat"))
    first = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="First",
            price_cents=1000,
            category_ids=[cat.id],
        )
    )
    second = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Second",
            price_cents=1000,
            category_ids=[cat.id],
        )
    )
    repo.set_category_product_order(cat.id, [second.id, first.id])

    loaded_first = repo.get_product(first.id)
    loaded_second = repo.get_product(second.id)
    assert loaded_first.category_sort_indices[str(cat.id)] == 1
    assert loaded_second.category_sort_indices[str(cat.id)] == 0


@requires_db
def test_full_menu_only_published_approved(session):
    r = _restaurant(session, "menu5")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Cat"))
    repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Draft",
            price_cents=1000,
            category_ids=[cat.id],
        )
    )
    repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Live",
            price_cents=1000,
            status="active",
            category_ids=[cat.id],
        )
    )
    menu = repo.get_full_menu(r.id)
    names = [p.name for p in menu.products]
    assert names == ["Live"]
    assert len(menu.categories) == 1


@requires_db
def test_category_sort_indices_batch_matches_single(session):
    r = _restaurant(session, "menu-batch-sort")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Cat"))
    first = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="First",
            price_cents=1000,
            category_ids=[cat.id],
        )
    )
    second = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Second",
            price_cents=1000,
            category_ids=[cat.id],
        )
    )
    repo.set_category_product_order(cat.id, [second.id, first.id])

    batch = _category_sort_indices_batch(session, [first.id, second.id])
    assert batch[first.id] == _category_sort_indices(session, first.id)
    assert batch[second.id] == _category_sort_indices(session, second.id)


@requires_db
def test_set_category_product_order_active_only_when_inactive_linked(session):
    r = _restaurant(session, "menu-order-active-only")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Burgers"))
    active = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Active",
            price_cents=1000,
            status="active",
            category_ids=[cat.id],
        )
    )
    inactive = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Inactive",
            price_cents=1000,
            status="inactive",
            category_ids=[cat.id],
        )
    )

    repo.set_category_product_order(cat.id, [active.id])

    loaded_active = repo.get_product_by_id(active.id)
    loaded_inactive = repo.get_product_by_id(inactive.id)
    assert loaded_active is not None
    assert loaded_inactive is not None
    assert loaded_active.category_sort_indices[str(cat.id)] == 0
    assert loaded_inactive.category_sort_indices[str(cat.id)] == 1


@requires_db
def test_set_product_option_group_order(session):
    r = _restaurant(session, "menu-option-group-order")
    repo = SqlAlchemyMenuRepository(session)
    product = repo.add_product(ProductCreate(restaurant_id=r.id, name="Burger", price_cents=10000))
    extras = repo.add_option_group(
        product.id,
        OptionGroupCreate(title="Extras", sort_index=0),
    )
    salsa = repo.add_option_group(
        product.id,
        OptionGroupCreate(title="Salsa", sort_index=1),
    )

    repo.set_product_option_group_order(product.id, [salsa.id, extras.id])

    loaded = repo.get_product(product.id)
    assert loaded is not None
    titles = [group.title for group in sorted(loaded.option_groups, key=lambda g: g.sort_index)]
    assert titles == ["Salsa", "Extras"]


@requires_db
def test_set_option_group_item_order(session):
    r = _restaurant(session, "menu-option-item-order")
    repo = SqlAlchemyMenuRepository(session)
    product = repo.add_product(ProductCreate(restaurant_id=r.id, name="Taco", price_cents=1000))
    group = repo.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Extras",
            items=[
                OptionItemCreate(label="Cebolla", sort_index=0),
                OptionItemCreate(label="Sprite", sort_index=1),
            ],
        ),
    )
    cebolla_id = group.items[0].id
    sprite_id = group.items[1].id

    repo.set_option_group_item_order(group.id, [sprite_id, cebolla_id])

    loaded = repo.get_product(product.id)
    assert loaded is not None
    labels = [
        item.label
        for item in sorted(loaded.option_groups[0].items, key=lambda item: item.sort_index)
    ]
    assert labels == ["Sprite", "Cebolla"]


@requires_db
def test_set_option_group_item_order_active_only_when_inactive_linked(session):
    r = _restaurant(session, "menu-option-item-order-active")
    repo = SqlAlchemyMenuRepository(session)
    product = repo.add_product(ProductCreate(restaurant_id=r.id, name="Combo", price_cents=2000))
    group = repo.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Bebidas",
            items=[
                OptionItemCreate(label="Sprite", sort_index=0),
                OptionItemCreate(label="Cebolla", sort_index=1),
            ],
        ),
    )
    sprite_id = group.items[0].id
    cebolla_id = group.items[1].id
    repo.update_option_item(cebolla_id, OptionItemUpdate(is_active=False))

    repo.set_option_group_item_order(group.id, [sprite_id])

    loaded = repo.get_product(product.id)
    assert loaded is not None
    items = sorted(loaded.option_groups[0].items, key=lambda item: item.sort_index)
    assert items[0].label == "Sprite"
    assert items[0].is_active is True
    assert items[1].label == "Cebolla"
    assert items[1].is_active is False


@requires_db
def test_get_full_menu_bounded_query_count(session, engine):
    from sqlalchemy import event

    r = _restaurant(session, "menu-query-count")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="Cat"))

    for index in range(5):
        product = repo.add_product(
            ProductCreate(
                restaurant_id=r.id,
                name=f"Product {index}",
                price_cents=1000 + index,
                status="active",
                category_ids=[cat.id],
            )
        )
        repo.add_option_group(
            product.id,
            OptionGroupCreate(
                title="Extras",
                selection="single",
                items=[
                    OptionItemCreate(label="A", price_delta_cents=0),
                    OptionItemCreate(label="B", price_delta_cents=100),
                ],
            ),
        )

    query_count = {"n": 0}

    def before_cursor_execute(
        conn, cursor, statement, parameters, context, executemany
    ) -> None:
        query_count["n"] += 1

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        menu = repo.get_full_menu(r.id)
        assert len(menu.products) == 5
        assert query_count["n"] <= 10
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)
