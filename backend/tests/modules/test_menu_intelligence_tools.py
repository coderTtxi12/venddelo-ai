import uuid
from unittest.mock import patch

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_intelligence.tools import MenuIntelligenceSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_suggest_complements_returns_new_groups(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Intel Menu", subdomain="menu-intel-suggest")
    )
    burgers = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Hamburguesas"),
    )
    drinks = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas"),
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Coca-Cola",
            description="600 ml",
            price_cents=2500,
            category_ids=[drinks.id],
        )
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            description="Clásica con queso",
            price_cents=10000,
            category_ids=[burgers.id],
            image_path="restaurants/demo/products/sample.webp",
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_intelligence"],
    )
    skill = MenuIntelligenceSkill()

    with (
        patch(
            "app.modules.assistant.skills.menu_intelligence.tools.build_vision_provider",
        ) as vision_factory,
        patch(
            "app.modules.assistant.skills.menu_intelligence.tools.load_product_image_bytes",
            return_value=(b"fake-webp", "image/webp"),
        ),
    ):
        from app.infra.vision.stub_provider import StubVisionProvider

        vision_factory.return_value = StubVisionProvider()
        result = skill.execute(
            "suggest_complements",
            {"product_id": str(product.id), "include_image_analysis": True},
            ctx,
        )

    assert result.ok is True
    assert result.data["suggested_groups"]
    assert result.data["beverage_hints_used"] >= 1
    assert "apply_with" in result.data
    first_group = result.data["suggested_groups"][0]
    assert first_group["title"]
    assert first_group["items"]


@requires_db
def test_analyze_product_image_requires_image_path(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="No Photo", subdomain="menu-intel-no-photo")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos"),
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco pastor",
            description="Con piña",
            price_cents=3000,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_intelligence"],
    )

    result = MenuIntelligenceSkill().execute(
        "analyze_product_image",
        {"product_id": str(product.id)},
        ctx,
    )

    assert result.ok is False
    assert "no image_path" in result.summary.lower()
