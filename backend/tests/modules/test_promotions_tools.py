import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import MenuReadSkill
from app.modules.assistant.skills.promotions.tools import PromotionsSkill
from app.modules.assistant.skills.registry import SkillRegistry
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def test_promotions_skill_registered():
    registry = SkillRegistry([PromotionsSkill()])
    tools = registry.tool_definitions(effective_skill_ids=["promotions"])
    names = {tool.name for tool in tools}
    assert names == {
        "create_promotion",
        "update_nxm_promotion",
        "update_nxm_promotion_complements",
        "disable_promotion",
        "generate_promotion_banner",
    }


@requires_db
def test_create_and_disable_marketing_promotion(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Write", subdomain="promo-write-skill")
    )
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Alitas", sort_index=0)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions", "menu_read"],
    )
    skill = PromotionsSkill()
    read = MenuReadSkill()

    created = skill.execute(
        "create_promotion",
        {
            "name": "2×1 Alitas",
            "type": "bundle",
            "scope": "product",
            "product_names": ["WINGS & FRIES"],
            "image_path": "restaurants/promo-banner.png",
        },
        ctx,
    )
    assert created.ok is True, created.summary
    promo = created.data["promotion"]
    assert promo["type"] == "bundle"
    assert promo["label"] == "2×1"
    assert promo["products"][0]["id"] == str(product.id)

    listed = read.execute("list_promotions", {"include_catalog": False}, ctx)
    assert listed.ok is True
    assert any(row["id"] == promo["id"] for row in listed.data["promotions"])

    disabled = skill.execute("disable_promotion", {"name": "2×1 Alitas"}, ctx)
    assert disabled.ok is True
    assert disabled.data["is_active"] is False

    listed_after = read.execute(
        "list_promotions",
        {"include_catalog": False, "effective_only": False},
        ctx,
    )
    assert listed_after.ok is True
    assert not any(row["id"] == promo["id"] for row in listed_after.data["promotions"])


@requires_db
def test_create_promotion_requires_targets_for_bundle(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Missing", subdomain="promo-write-missing")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions"],
    )
    skill = PromotionsSkill()

    result = skill.execute(
        "create_promotion",
        {
            "name": "2×1 vacío",
            "type": "2x1",
            "scope": "product",
        },
        ctx,
    )
    assert result.ok is False
    assert "at least one product or category" in result.summary
@requires_db
def test_update_nxm_promotion_adds_product_without_removing_existing(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="NxM Add", subdomain="nxm-tool-add")
    )
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Alitas", sort_index=0)
    )
    wings = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
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
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions"],
    )
    skill = PromotionsSkill()

    created = skill.execute(
        "create_promotion",
        {
            "name": "2×1 Alitas",
            "type": "bundle",
            "scope": "product",
            "product_names": ["WINGS & FRIES"],
            "image_path": "restaurants/promo.png",
        },
        ctx,
    )
    assert created.ok is True
    promo_id = created.data["promotion"]["id"]

    updated = skill.execute(
        "update_nxm_promotion",
        {
            "promotion_id": promo_id,
            "add_product_names": ["BONELESS"],
        },
        ctx,
    )
    assert updated.ok is True, updated.summary
    product_ids = {row["id"] for row in updated.data["promotion"]["products"]}
    assert str(wings.id) in product_ids
    assert str(boneless.id) in product_ids


@requires_db
def test_update_nxm_promotion_complements_disable_and_enable(session):
    from app.modules.menu.schemas import OptionGroupCreate, OptionItemCreate

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="NxM Complements", subdomain="nxm-tool-complements")
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
    group = uow.menu.add_option_group(
        burger.id,
        OptionGroupCreate(
            title="Extras",
            items=[
                OptionItemCreate(label="Queso"),
                OptionItemCreate(label="Tocino"),
            ],
        ),
    )
    queso = group.items[0]
    tocino = group.items[1]

    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions"],
    )
    skill = PromotionsSkill()

    created = skill.execute(
        "create_promotion",
        {
            "name": "2×1 Burgers",
            "type": "bundle",
            "scope": "product",
            "product_names": ["HAMBURGUESA"],
            "image_path": "restaurants/promo.png",
        },
        ctx,
    )
    assert created.ok is True
    promo_id = created.data["promotion"]["id"]

    disabled = skill.execute(
        "update_nxm_promotion_complements",
        {
            "promotion_id": promo_id,
            "disable_option_item_labels": ["Tocino"],
        },
        ctx,
    )
    assert disabled.ok is True, disabled.summary
    disabled_ids = {str(item_id) for item_id in disabled.data["promotion"].get("option_item_ids", [])}
    assert str(queso.id) in disabled_ids
    assert str(queso.id) in disabled_ids
    assert str(tocino.id) not in disabled_ids

    enabled = skill.execute(
        "update_nxm_promotion_complements",
        {
            "promotion_id": promo_id,
            "enable_option_item_labels": ["Tocino"],
        },
        ctx,
    )
    assert enabled.ok is True, enabled.summary
    enabled_ids = enabled.data["promotion"].get("option_item_ids", [])
    assert str(queso.id) in enabled_ids
    assert str(tocino.id) in enabled_ids


@requires_db
def test_generate_promotion_banner_sets_image_path(session):
    from unittest.mock import patch

    from app.infra.image.stub_provider import StubImageProvider
    from app.infra.storage.memory_storage import MemoryStorageAdapter

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Banner", subdomain="promo-banner-gen")
    )
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=0)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA BBQ",
            description="Bacon, queso, cebolla caramelizada",
            price_cents=18900,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions"],
    )
    skill = PromotionsSkill()

    created = skill.execute(
        "create_promotion",
        {
            "name": "2×1 Hamburguesas",
            "type": "bundle",
            "scope": "product",
            "product_names": ["HAMBURGUESA BBQ"],
        },
        ctx,
    )
    assert created.ok is True
    promo_id = created.data["promotion"]["id"]

    with (
        patch(
            "app.modules.assistant.skills.promotions.banner_generate.build_image_provider",
            return_value=StubImageProvider(),
        ),
        patch(
            "app.modules.assistant.skills.promotions.banner_generate.build_storage",
            return_value=MemoryStorageAdapter(),
        ),
    ):
        result = skill.execute(
            "generate_promotion_banner",
            {"promotion_id": promo_id},
            ctx,
        )

    assert result.ok is True, result.summary
    assert result.data["image_path"].endswith(".webp")
    assert result.data["public_url"].startswith("memory://")
    assert "2X1" in result.data["offer_label"] or "2" in result.data["offer_label"]

    promo = uow.promotions.get(uuid.UUID(promo_id))
    assert promo is not None
    assert promo.image_path == result.data["image_path"]
    assert str(product.id) in [str(pid) for pid in promo.product_ids]
