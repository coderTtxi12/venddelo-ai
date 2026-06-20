from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryUpdate,
    OptionGroupCreate,
    OptionItemCreate,
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
            approval_status="approved",
            is_published=True,
            category_ids=[cat.id],
        )
    )
    repo.update_product(unavailable.id, ProductUpdate(is_active=False))
    repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Available",
            price_cents=1000,
            approval_status="approved",
            is_published=True,
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
            approval_status="approved",
            is_published=True,
            category_ids=[cat.id],
        )
    )
    menu = repo.get_full_menu(r.id)
    names = [p.name for p in menu.products]
    assert names == ["Live"]
    assert len(menu.categories) == 1
