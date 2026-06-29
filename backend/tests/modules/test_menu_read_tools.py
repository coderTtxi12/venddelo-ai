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


@requires_db
def test_menu_read_list_products_paginates_all_active_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Paginated Menu", subdomain="menu-read-page")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    for index in range(5):
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name=f"Taco {index}",
                price_cents=1000 + index,
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

    first = skill.execute("list_products", {"limit": 2}, ctx)
    second = skill.execute(
        "list_products",
        {"limit": 2, "cursor": first.data["next_cursor"]},
        ctx,
    )

    assert first.ok is True
    assert len(first.data["products"]) == 2
    assert first.data["has_more"] is True
    assert first.data["next_cursor"]

    assert second.ok is True
    assert len(second.data["products"]) == 2
    assert second.data["has_more"] is True

    third = skill.execute(
        "list_products",
        {"limit": 2, "cursor": second.data["next_cursor"]},
        ctx,
    )
    assert third.ok is True
    assert len(third.data["products"]) == 1
    assert third.data["has_more"] is False


@requires_db
def test_menu_read_list_products_filters_by_category(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Category Filter", subdomain="menu-read-category")
    )
    tacos = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    drinks = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas", sort_index=2)
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco pastor",
            price_cents=1200,
            category_ids=[tacos.id],
        )
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Agua",
            price_cents=300,
            category_ids=[drinks.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    tacos_page = skill.execute("list_products", {"category_id": str(tacos.id)}, ctx)
    all_page = skill.execute("list_products", {}, ctx)

    assert tacos_page.ok is True
    assert len(tacos_page.data["products"]) == 1
    assert tacos_page.data["products"][0]["name"] == "Taco pastor"
    assert tacos_page.data["category_id"] == str(tacos.id)

    assert all_page.ok is True
    assert len(all_page.data["products"]) == 2


@requires_db
def test_menu_read_get_product_returns_owned_product(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Owned Product", subdomain="menu-read-owned-product")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco suadero",
            price_cents=1100,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)

    assert result.ok is True
    assert result.data["product"]["name"] == "Taco suadero"
