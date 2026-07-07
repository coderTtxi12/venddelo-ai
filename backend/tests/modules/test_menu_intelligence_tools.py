import uuid
from unittest.mock import patch

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_intelligence.tools import MenuIntelligenceSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


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
