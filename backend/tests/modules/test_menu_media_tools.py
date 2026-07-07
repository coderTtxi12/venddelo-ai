import uuid
from unittest.mock import patch

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.image.stub_provider import StubImageProvider
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_media.tools import MenuMediaSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_generate_product_image_sets_image_path(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Media Menu", subdomain="menu-media-gen")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Platos"),
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Ensalada César",
            description="Lechuga romana, parmesano, crutones",
            price_cents=12000,
            category_ids=[category.id],
        ),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_media"],
    )
    skill = MenuMediaSkill()

    with (
        patch(
            "app.modules.assistant.skills.menu_media.tools.build_image_provider",
            return_value=StubImageProvider(),
        ),
        patch(
            "app.modules.assistant.skills.menu_media.tools.build_storage",
            return_value=MemoryStorageAdapter(),
        ),
    ):
        result = skill.execute(
            "generate_product_image",
            {"product_id": str(product.id)},
            ctx,
        )

    assert result.ok is True
    assert result.data["product"]["image_path"]
    assert result.data["product"]["public_url"].startswith("memory://")
    assert "Ensalada César" in result.summary

    refreshed = uow.menu.get_product_by_id(product.id)
    assert refreshed is not None
    assert refreshed.image_path == result.data["product"]["image_path"]
    assert refreshed.image_path.endswith(".webp")


@requires_db
def test_generate_product_image_skips_existing_without_force(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Has Photo", subdomain="menu-media-has-photo")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas"),
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Agua",
            description="500 ml",
            price_cents=2500,
            category_ids=[category.id],
            image_path="restaurants/demo/products/existing.png",
        ),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_media"],
    )
    skill = MenuMediaSkill()

    result = skill.execute(
        "generate_product_image",
        {"product_id": str(product.id)},
        ctx,
    )

    assert result.ok is False
    assert "already has an image" in result.summary
