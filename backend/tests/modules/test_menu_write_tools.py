import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import (
    DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
)
from app.modules.assistant.skills.menu_write.tools import MenuWriteSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_menu_write_creates_and_updates_category(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Write Menu", subdomain="menu-write-cat")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    created = skill.execute(
        "create_category",
        {"name": "Bebidas", "description": "Refrescos"},
        ctx,
    )
    assert created.ok is True
    category_id = created.data["category"]["id"]

    updated = skill.execute(
        "update_category",
        {"category_id": category_id, "name": "Bebidas frías"},
        ctx,
    )
    assert updated.ok is True
    assert updated.data["category"]["name"] == "Bebidas frías"


@requires_db
def test_menu_write_updates_category_display_layout(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Layout Menu", subdomain="menu-write-cat-layout")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    created = skill.execute(
        "create_category",
        {"name": "Tacos", "description": "Clásicos"},
        ctx,
    )
    assert created.ok is True
    category_id = created.data["category"]["id"]

    updated = skill.execute(
        "update_category",
        {"category_id": category_id, "display_layout": "grid"},
        ctx,
    )
    assert updated.ok is True
    assert updated.data["category"]["display_layout"] == "grid"


@requires_db
def test_menu_write_updates_special_categories(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Special Cats", subdomain="menu-write-special-cats")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    promotions = skill.execute(
        "update_category",
        {
            "category_id": DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
            "name": "Ofertas del día",
            "is_active": False,
        },
        ctx,
    )
    assert promotions.ok is True
    assert promotions.data["category"]["name"] == "Ofertas del día"
    assert promotions.data["category"]["is_active"] is False
    assert promotions.data["category"]["category_type"] == "special_promotions"

    limited = skill.execute(
        "update_category",
        {
            "category_id": DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
            "name": "Solo hoy",
            "is_active": True,
        },
        ctx,
    )
    assert limited.ok is True
    assert limited.data["category"]["name"] == "Solo hoy"
    assert limited.data["category"]["is_active"] is True
    assert limited.data["category"]["category_type"] == "special_limited_time"

    loaded = uow.restaurants.get(restaurant.id)
    assert loaded is not None
    assert loaded.digital_menu_promotions_category_name == "Ofertas del día"
    assert loaded.digital_menu_promotions_category_enabled is False
    assert loaded.digital_menu_limited_time_category_name == "Solo hoy"
    assert loaded.digital_menu_limited_time_category_enabled is True


@requires_db
def test_menu_write_rejects_special_category_description(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Special Reject", subdomain="menu-write-special-reject")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "update_category",
        {
            "category_id": DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
            "description": "No aplica",
        },
        ctx,
    )
    assert result.ok is False
    assert "description" in result.summary


@requires_db
def test_menu_write_rejects_special_category_display_layout(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Special Layout", subdomain="menu-write-special-layout")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "update_category",
        {
            "category_id": DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
            "display_layout": "grid",
        },
        ctx,
    )
    assert result.ok is False
    assert "display_layout" in result.summary


@requires_db
def test_menu_write_creates_and_updates_product(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Write Products", subdomain="menu-write-prod")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    created = skill.execute(
        "create_product",
        {
            "name": "Taco al pastor",
            "price_cents": 1200,
            "category_ids": [str(category.id)],
            "description": "Con piña",
        },
        ctx,
    )
    assert created.ok is True
    product_id = created.data["product"]["id"]

    updated = skill.execute(
        "update_product",
        {"product_id": product_id, "price_cents": 1400},
        ctx,
    )
    assert updated.ok is True
    assert updated.data["product"]["price_cents"] == 1400


@requires_db
def test_menu_write_disables_product_without_delete(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Disable Product", subdomain="menu-write-disable")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Postres", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Flan",
            price_cents=800,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "update_product",
        {"product_id": str(product.id), "is_active": False},
        ctx,
    )
    assert result.ok is True
    assert result.data["product"]["is_active"] is False


@requires_db
def test_menu_write_updates_product_by_confirmed_name(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Resolve Name", subdomain="menu-write-resolve-name")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=1)
    )
    hamburguesa = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    updated = skill.execute(
        "update_product",
        {"name": "este HAMBURGUESA", "price_cents": 10000},
        ctx,
    )

    assert updated.ok is True
    assert updated.data["product"]["id"] == str(hamburguesa.id)
    assert updated.data["product"]["name"] == "HAMBURGUESA"
    assert updated.data["product"]["price_cents"] == 10000


@requires_db
def test_menu_write_bulk_updates_descriptions(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Desc", subdomain="menu-write-bulk-desc")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    first = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco uno",
            price_cents=1000,
            category_ids=[category.id],
            description="Vieja",
        )
    )
    second = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco dos",
            price_cents=1200,
            category_ids=[category.id],
            description="Vieja",
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_product_descriptions",
        {
            "items": [
                {"name": "Taco uno", "description": "Nueva uno"},
                {"product_id": str(second.id), "description": "Nueva dos"},
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0


@requires_db
def test_menu_write_bulk_updates_prices_by_name(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Price", subdomain="menu-write-bulk-price")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_product_prices",
        {"items": [{"name": "Hamburguesa", "price_cents": 10000}]},
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 1
    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    assert loaded.price_cents == 10000

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Options Menu", subdomain="menu-write-options")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Combo wings",
            price_cents=24400,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    group = skill.execute(
        "add_option_group",
        {
            "product_id": str(product.id),
            "title": "Salsa",
            "selection": "single",
            "required": True,
            "items": [{"label": "BBQ", "price_delta_cents": 0}],
        },
        ctx,
    )
    assert group.ok is True
    group_id = group.data["option_group"]["id"]

    item = skill.execute(
        "add_option_item",
        {
            "product_id": str(product.id),
            "group_id": group_id,
            "label": "Buffalo",
            "price_delta_cents": 1500,
        },
        ctx,
    )
    assert item.ok is True
    assert item.data["option_item"]["label"] == "Buffalo"
