import uuid

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import (
    DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
)
from app.modules.assistant.skills.menu_write.option_item_bulk import option_item_label_matches
from app.modules.assistant.skills.menu_write.tools import MenuWriteSkill
from app.modules.menu.schemas import CategoryCreate, OptionGroupCreate, OptionItemCreate, ProductCreate, ProductUpdate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def test_option_item_label_matches_exact_and_rejects_wrong_complement():
    assert option_item_label_matches("Sprite", "Sprite")
    assert option_item_label_matches("sprite", "Sprite")
    assert option_item_label_matches("Sprite", "Refresco Sprite")
    assert not option_item_label_matches("Sprite", "Cebolla")
    assert not option_item_label_matches("sprite", "Cebolla")


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
        {"product_id": str(product.id), "status": "inactive"},
        ctx,
    )
    assert result.ok is True
    assert result.data["product"]["status"] == "inactive"


@requires_db
def test_menu_write_update_product_ignores_null_optional_fields(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Null Fields", subdomain="menu-write-null-fields")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
            category_ids=[category.id],
            status="active",
        )
    )
    product = uow.menu.update_product(product.id, ProductUpdate(status="inactive"))
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "update_product",
        {
            "name": "Wings & Fries",
            "status": "active",
            "price_cents": None,
            "description": None,
            "new_name": None,
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["product"]["id"] == str(product.id)
    assert result.data["product"]["status"] == "active"
    assert result.data["product"]["price_cents"] == 24400


@requires_db
def test_menu_write_activates_wild_rooster_wings_and_fries_by_name(session, engine):
    """Inactive WINGS & FRIES is resolved by name, activated, and persisted to the DB."""
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Wild Rooster", subdomain="menu-write-wild-rooster")
        )
        category = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
        )
        wings_fries = uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="WINGS & FRIES",
                description="Alitas crujientes con papas.",
                price_cents=24400,
                category_ids=[category.id],
                status="active",
            )
        )
        wings_fries = uow.menu.update_product(
            wings_fries.id,
            ProductUpdate(status="inactive"),
        )
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="BONELESS & FRIES WITC SAUCE",
                price_cents=22900,
                category_ids=[category.id],
                status="active",
            )
        )
        restaurant_id = restaurant.id
        product_id = wings_fries.id
        uow.commit()

    with SqlAlchemyUnitOfWork(factory) as uow:
        ctx = AgentContext(
            restaurant_id=restaurant_id,
            conversation_id=uuid.uuid4(),
            uow=uow,
            effective_skill_ids=["menu_write"],
        )
        result = MenuWriteSkill().execute(
            "update_product",
            {"name": "Wings & Fries", "status": "active"},
            ctx,
        )

    assert result.ok is True
    assert result.data["product"]["id"] == str(product_id)
    assert result.data["product"]["name"] == "WINGS & FRIES"
    assert result.data["product"]["status"] == "active"

    with SqlAlchemyUnitOfWork(factory) as uow:
        reloaded = uow.menu.get_product_by_id(product_id)
        assert reloaded is not None
        assert reloaded.status == "active"


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


@requires_db
def test_menu_write_bulk_updates_category_fields(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Cat", subdomain="menu-write-bulk-cat")
    )
    tacos = uow.menu.add_category(
        CategoryCreate(
            restaurant_id=restaurant.id,
            name="Tacos",
            description="Vieja",
            sort_index=1,
        )
    )
    bebidas = uow.menu.add_category(
        CategoryCreate(
            restaurant_id=restaurant.id,
            name="Bebidas",
            description="Vieja",
            sort_index=2,
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    descriptions = skill.execute(
        "bulk_update_category_descriptions",
        {
            "items": [
                {"category_name": "Tacos", "description": "Nueva tacos"},
                {"category_id": str(bebidas.id), "description": "Nueva bebidas"},
            ]
        },
        ctx,
    )
    assert descriptions.ok is True
    assert descriptions.data["updated"] == 2

    sort_indices = skill.execute(
        "bulk_update_category_sort_indices",
        {
            "items": [
                {"name": "Tacos", "sort_index": 10},
                {"category_id": str(bebidas.id), "sort_index": 20},
            ]
        },
        ctx,
    )
    assert sort_indices.ok is True
    assert sort_indices.data["updated"] == 2

    layouts = skill.execute(
        "bulk_update_category_display_layout",
        {
            "items": [
                {"category_name": "Tacos", "display_layout": "grid"},
                {"category_id": str(bebidas.id), "display_layout": "horizontal"},
            ]
        },
        ctx,
    )
    assert layouts.ok is True
    assert layouts.data["updated"] == 2

    renamed = skill.execute(
        "bulk_update_category_names",
        {
            "items": [
                {"category_name": "Tacos", "new_name": "Tacos premium"},
            ]
        },
        ctx,
    )
    assert renamed.ok is True
    assert renamed.data["updated"] == 1

    loaded_tacos = uow.menu.get_category(tacos.id)
    loaded_bebidas = uow.menu.get_category(bebidas.id)
    assert loaded_tacos is not None
    assert loaded_bebidas is not None
    assert loaded_tacos.name == "Tacos premium"
    assert loaded_tacos.description == "Nueva tacos"
    assert loaded_tacos.sort_index == 10
    assert loaded_tacos.display_layout == "grid"
    assert loaded_bebidas.description == "Nueva bebidas"
    assert loaded_bebidas.sort_index == 20
    assert loaded_bebidas.display_layout == "horizontal"


@requires_db
def test_menu_write_bulk_updates_special_category_visibility(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Special", subdomain="menu-write-bulk-special")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_category_visibility",
        {
            "items": [
                {
                    "category_id": DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
                    "is_active": False,
                }
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 1
    updated = uow.restaurants.get(restaurant.id)
    assert updated is not None
    assert updated.digital_menu_promotions_category_enabled is False


@requires_db
def test_menu_write_bulk_rejects_description_on_special_category(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Special Desc", subdomain="menu-write-bulk-special-desc")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_category_descriptions",
        {
            "items": [
                {
                    "category_id": DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
                    "description": "No permitido",
                }
            ]
        },
        ctx,
    )

    assert result.ok is False
    assert result.data["updated"] == 0
    assert result.data["failed"] == 1


@requires_db
def test_menu_write_option_group_and_item(session):
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


@requires_db
def test_menu_write_bulk_updates_option_item_visibility(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Options", subdomain="menu-write-bulk-options")
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
        )
    )
    second = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco dos",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    first_group = uow.menu.add_option_group(
        first.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Cebolla")]),
    )
    second_group = uow.menu.add_option_group(
        second.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Cebolla")]),
    )
    first_item_id = first_group.items[0].id
    second_item_id = second_group.items[0].id
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_option_item_visibility",
        {
            "items": [
                {
                    "product_id": str(first.id),
                    "group_id": str(first_group.id),
                    "item_id": str(first_item_id),
                    "expected_label": "Cebolla",
                    "is_active": False,
                },
                {
                    "name": "Taco dos",
                    "group_id": str(second_group.id),
                    "item_id": str(second_item_id),
                    "expected_label": "Cebolla",
                    "is_active": False,
                },
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0

    loaded_first = uow.menu.get_product(first.id)
    loaded_second = uow.menu.get_product(second.id)
    assert loaded_first is not None
    assert loaded_second is not None
    assert loaded_first.option_groups[0].items[0].is_active is False
    assert loaded_second.option_groups[0].items[0].is_active is False


@requires_db
def test_menu_write_bulk_updates_option_item_prices_without_group_id(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Price No Group", subdomain="menu-write-bulk-price-no-group")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco combo",
            price_cents=1000,
            category_ids=[category.id],
        )
    )
    group = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Guacamole", price_delta_cents=500)]),
    )
    item_id = group.items[0].id
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_option_item_prices",
        {
            "items": [
                {
                    "product_id": str(product.id),
                    "item_id": str(item_id),
                    "price_delta_cents": 1500,
                }
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 1
    assert result.data["failed"] == 0

    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    assert loaded.option_groups[0].items[0].price_delta_cents == 1500


@requires_db
def test_menu_write_bulk_visibility_by_match_label(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Label Match", subdomain="menu-write-bulk-label-match")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas", sort_index=1)
    )
    burger = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=10000,
            category_ids=[category.id],
        )
    )
    taco = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco combo",
            price_cents=8000,
            category_ids=[category.id],
        )
    )
    uow.menu.add_option_group(
        burger.id,
        OptionGroupCreate(
            title="Elige tus extras",
            items=[
                OptionItemCreate(label="Sprite"),
                OptionItemCreate(label="Cebolla"),
            ],
        ),
    )
    uow.menu.add_option_group(
        taco.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Sprite")]),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_option_item_visibility",
        {"match_label": "Sprite", "is_active": False},
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0

    loaded_burger = uow.menu.get_product(burger.id)
    loaded_taco = uow.menu.get_product(taco.id)
    assert loaded_burger is not None
    assert loaded_taco is not None
    burger_labels = {item.label: item.is_active for item in loaded_burger.option_groups[0].items}
    taco_labels = {item.label: item.is_active for item in loaded_taco.option_groups[0].items}
    assert burger_labels["Sprite"] is False
    assert burger_labels["Cebolla"] is True
    assert taco_labels["Sprite"] is False


@requires_db
def test_menu_write_bulk_visibility_rejects_expected_label_mismatch(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Label Guard", subdomain="menu-write-bulk-label-guard")
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
    group = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Extras",
            items=[
                OptionItemCreate(label="Sprite"),
                OptionItemCreate(label="Cebolla"),
            ],
        ),
    )
    cebolla_id = next(item.id for item in group.items if item.label == "Cebolla")
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_update_option_item_visibility",
        {
            "items": [
                {
                    "product_id": str(product.id),
                    "group_id": str(group.id),
                    "item_id": str(cebolla_id),
                    "expected_label": "Sprite",
                    "is_active": False,
                }
            ]
        },
        ctx,
    )

    assert result.ok is False
    assert result.data["updated"] == 0
    assert result.data["failed"] == 1
    assert "does not match live label" in result.data["results"][0]["error"]

    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    labels = {item.label: item.is_active for item in loaded.option_groups[0].items}
    assert labels["Cebolla"] is True
    assert labels["Sprite"] is True


@requires_db
def test_menu_write_deletes_option_item(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Delete Option", subdomain="menu-write-delete-option")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco al pastor",
            price_cents=8000,
            category_ids=[category.id],
        )
    )
    group = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Extras",
            items=[
                OptionItemCreate(label="Cebolla"),
                OptionItemCreate(label="Cilantro"),
            ],
        ),
    )
    cebolla_id = next(item.id for item in group.items if item.label == "Cebolla")
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "delete_option_item",
        {
            "product_id": str(product.id),
            "group_id": str(group.id),
            "item_id": str(cebolla_id),
            "expected_label": "Cebolla",
        },
        ctx,
    )

    assert result.ok is True
    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    labels = [item.label for item in loaded.option_groups[0].items]
    assert labels == ["Cilantro"]


@requires_db
def test_menu_write_bulk_deletes_option_items_same_product(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Delete Options", subdomain="menu-write-bulk-delete-options")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=24400,
            category_ids=[category.id],
        )
    )
    sauces = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Salsas",
            items=[
                OptionItemCreate(label="BBQ"),
                OptionItemCreate(label="Buffalo"),
            ],
        ),
    )
    extras = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Queso extra")]),
    )
    bbq_id = next(item.id for item in sauces.items if item.label == "BBQ")
    queso_id = extras.items[0].id
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_delete_option_items",
        {
            "product_id": str(product.id),
            "items": [
                {
                    "group_id": str(sauces.id),
                    "item_id": str(bbq_id),
                    "expected_label": "BBQ",
                },
                {
                    "group_id": str(extras.id),
                    "item_id": str(queso_id),
                    "expected_label": "Queso extra",
                },
            ],
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0

    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    sauce_labels = [item.label for item in loaded.option_groups[0].items]
    extra_labels = [item.label for item in loaded.option_groups[1].items]
    assert sauce_labels == ["Buffalo"]
    assert extra_labels == []


@requires_db
def test_menu_write_delete_rejects_expected_label_mismatch(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Delete Label Guard", subdomain="menu-write-delete-label-guard")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Refresco",
            price_cents=3000,
            category_ids=[category.id],
        )
    )
    group = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Sabor",
            items=[OptionItemCreate(label="Sprite"), OptionItemCreate(label="Cebolla")],
        ),
    )
    sprite_id = next(item.id for item in group.items if item.label == "Sprite")
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_delete_option_items",
        {
            "name": "Refresco",
            "items": [
                {
                    "group_id": str(group.id),
                    "item_id": str(sprite_id),
                    "expected_label": "Cebolla",
                }
            ],
        },
        ctx,
    )

    assert result.ok is False
    assert result.data["updated"] == 0
    assert result.data["failed"] == 1
    assert "does not match live label" in result.data["results"][0]["error"]

    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    labels = [item.label for item in loaded.option_groups[0].items]
    assert labels == ["Sprite", "Cebolla"]


@requires_db
def test_menu_write_reorders_option_groups_and_items(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Reorder Options", subdomain="menu-write-reorder-options")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=24400,
            category_ids=[category.id],
        )
    )
    extras = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Extras",
            sort_index=0,
            items=[
                OptionItemCreate(label="Sprite", sort_index=0),
                OptionItemCreate(label="Cebolla", sort_index=1),
            ],
        ),
    )
    salsa = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(title="Salsa", sort_index=1, items=[OptionItemCreate(label="BBQ")]),
    )
    sprite_id = extras.items[0].id
    cebolla_id = extras.items[1].id
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    group_result = skill.execute(
        "set_product_option_group_order",
        {
            "name": "BURGER & BONELESS",
            "group_ids": [str(salsa.id), str(extras.id)],
        },
        ctx,
    )
    assert group_result.ok is True

    item_result = skill.execute(
        "set_option_group_item_order",
        {
            "product_id": str(product.id),
            "group_id": str(extras.id),
            "item_ids": [str(cebolla_id), str(sprite_id)],
        },
        ctx,
    )
    assert item_result.ok is True

    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    group_titles = [group.title for group in sorted(loaded.option_groups, key=lambda g: g.sort_index)]
    assert group_titles == ["Salsa", "Extras"]
    extras_group = next(group for group in loaded.option_groups if group.title == "Extras")
    item_labels = [item.label for item in sorted(extras_group.items, key=lambda item: item.sort_index)]
    assert item_labels == ["Cebolla", "Sprite"]


@requires_db
def test_menu_write_bulk_adds_option_items(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Add Items", subdomain="menu-write-bulk-add-items")
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
        )
    )
    second = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco dos",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    first_group = uow.menu.add_option_group(
        first.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Limón")]),
    )
    second_group = uow.menu.add_option_group(
        second.id,
        OptionGroupCreate(title="Extras", items=[OptionItemCreate(label="Limón")]),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_add_option_items",
        {
            "items": [
                {
                    "product_id": str(first.id),
                    "group_id": str(first_group.id),
                    "label": "Guacamole",
                    "price_delta_cents": 2000,
                },
                {
                    "name": "Taco dos",
                    "group_id": str(second_group.id),
                    "label": "Guacamole",
                    "price_delta_cents": 2000,
                },
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0

    loaded_first = uow.menu.get_product(first.id)
    loaded_second = uow.menu.get_product(second.id)
    assert loaded_first is not None
    assert loaded_second is not None
    first_labels = [item.label for item in loaded_first.option_groups[0].items]
    second_labels = [item.label for item in loaded_second.option_groups[0].items]
    assert "Guacamole" in first_labels
    assert "Guacamole" in second_labels


@requires_db
def test_menu_write_bulk_adds_option_groups(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Add Groups", subdomain="menu-write-bulk-add-groups")
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
        )
    )
    second = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco dos",
            price_cents=1200,
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
        "bulk_add_option_groups",
        {
            "items": [
                {
                    "product_id": str(first.id),
                    "title": "Salsa",
                    "selection": "single",
                    "items": [
                        {"label": "Roja", "price_delta_cents": 0},
                        {"label": "Verde", "price_delta_cents": 0},
                    ],
                },
                {
                    "name": "Taco dos",
                    "title": "Salsa",
                    "selection": "single",
                    "items": [{"label": "Roja", "price_delta_cents": 0}],
                },
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0

    loaded_first = uow.menu.get_product(first.id)
    loaded_second = uow.menu.get_product(second.id)
    assert loaded_first is not None
    assert loaded_second is not None
    assert any(group.title == "Salsa" for group in loaded_first.option_groups)
    assert any(group.title == "Salsa" for group in loaded_second.option_groups)
    first_salsa = next(group for group in loaded_first.option_groups if group.title == "Salsa")
    assert len(first_salsa.items) == 2


@requires_db
def test_menu_write_applies_menu_theme_without_import_session(session):
    from app.modules.digital_menu_themes.repository import DigitalMenuThemeRepository

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Theme Write", subdomain="menu-write-theme")
    )
    DigitalMenuThemeRepository(session).upsert(
        {
            "id": "taqueria-viva",
            "label": "Taquería",
            "description": "Warm taqueria theme.",
            "best_for": ["Taquería"],
            "recommendation": "Mexican street food menus.",
            "style_keywords": ["warm"],
            "is_active": True,
            "sort_order": 1,
        }
    )
    session.flush()
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    listed = skill.execute("list_menu_themes", {}, ctx)
    assert listed.ok is True
    assert any(theme["id"] == "taqueria-viva" for theme in listed.data["themes"])

    applied = skill.execute("apply_menu_theme", {"theme_id": "taqueria-viva"}, ctx)
    assert applied.ok is True
    assert applied.data["label"] == "Taquería"

    loaded = uow.restaurants.get(restaurant.id)
    assert loaded is not None
    assert loaded.digital_menu_theme_id == "taqueria-viva"
