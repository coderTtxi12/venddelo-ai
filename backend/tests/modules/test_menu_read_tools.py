import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import MenuReadSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_menu_read_lists_categories_and_searches_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(RestaurantCreate(name="Menu Read", subdomain="menu-read"))
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco al pastor",
            description="Con piña",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    categories = skill.execute("list_categories", {}, ctx)
    products = skill.execute("search_products", {"query": "pastor"}, ctx)

    assert categories.ok is True
    assert categories.data["categories"][0]["name"] == "Tacos"
    assert products.ok is True
    assert products.data["products"][0]["id"] == str(product.id)


@requires_db
def test_menu_read_get_product_is_tenant_scoped(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    owned = uow.restaurants.add(RestaurantCreate(name="Owned", subdomain="owned-read"))
    other = uow.restaurants.add(RestaurantCreate(name="Other", subdomain="other-read"))
    uow.menu.add_category(CategoryCreate(restaurant_id=owned.id, name="Owned category"))
    other_category = uow.menu.add_category(
        CategoryCreate(restaurant_id=other.id, name="Other category")
    )
    other_product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=other.id,
            name="Other taco",
            price_cents=1000,
            category_ids=[other_category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=owned.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("get_product", {"product_id": str(other_product.id)}, ctx)

    assert result.ok is False
    assert "not found" in result.summary.lower()
