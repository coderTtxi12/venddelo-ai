import uuid
from unittest.mock import patch

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.import_asset_paths import products_prefix
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.tools import MenuWriteSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate, ProductUpdate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_assign_product_image(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Photo Write", subdomain="menu-write-photos")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco al Pastor",
            description="Con piña",
            price_cents=3500,
            category_ids=[category.id],
        )
    )
    image_path = f"restaurants/{restaurant.id}/import/product_photo/pastor.jpg"
    storage = MemoryStorageAdapter()
    storage.upload(image_path, b"fake-image", "image/jpeg")
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    with patch(
        "app.modules.assistant.skills.menu_write.product_photos.build_storage",
        return_value=storage,
    ):
        assigned = skill.execute(
            "assign_product_image",
            {"storage_path": image_path, "product_id": str(product.id)},
            ctx,
        )
    assert assigned.ok is True
    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    assert loaded.image_path is not None
    assert loaded.image_path.startswith(products_prefix(restaurant.id))


@requires_db
def test_bulk_assign_product_images(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Photos", subdomain="menu-write-bulk-photos")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas", sort_index=1)
    )
    first = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Agua",
            price_cents=2500,
            category_ids=[category.id],
        )
    )
    second = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Refresco",
            price_cents=3000,
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
    storage = MemoryStorageAdapter()
    path_one = f"restaurants/{restaurant.id}/import/product_photo/agua.jpg"
    path_two = f"restaurants/{restaurant.id}/import/product_photo/refresco.jpg"
    storage.upload(path_one, b"one", "image/jpeg")
    storage.upload(path_two, b"two", "image/jpeg")

    with patch(
        "app.modules.assistant.skills.menu_write.product_photos.build_storage",
        return_value=storage,
    ):
        result = skill.execute(
            "bulk_assign_product_images",
            {
                "items": [
                    {"storage_path": path_one, "name": "Agua"},
                    {"storage_path": path_two, "product_name": "Refresco"},
                ]
            },
            ctx,
        )

    assert result.ok is True
    assert result.data["updated"] == 2
    assert uow.menu.get_product(first.id).image_path.startswith(products_prefix(restaurant.id))
    assert uow.menu.get_product(second.id).image_path.startswith(products_prefix(restaurant.id))


@requires_db
def test_remove_product_image_clears_db_path(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Remove Photo", subdomain="menu-write-remove-photo")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco",
            price_cents=3000,
            category_ids=[category.id],
        )
    )
    image_path = f"restaurants/{restaurant.id}/products/existing.webp"
    uow.menu.update_product(
        restaurant.id,
        product.id,
        ProductUpdate(image_path=image_path),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    removed = skill.execute(
        "remove_product_image",
        {"product_id": str(product.id)},
        ctx,
    )
    assert removed.ok is True
    assert uow.menu.get_product(product.id).image_path is None

