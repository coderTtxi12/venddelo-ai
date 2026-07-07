import json
import uuid
from unittest.mock import patch

from app.core.vision.ports import VisionAnalysisResult
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.product_photo_prompt import (
    build_product_photo_match_prompt,
)
from app.modules.assistant.skills.menu_write.product_photos import _classify_photo_match
from app.modules.assistant.skills.menu_write.tools import MenuWriteSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def test_build_product_photo_match_prompt_includes_catalog():
    prompt = build_product_photo_match_prompt(
        [{"product_id": "abc-123", "name": "Taco", "description": "Con salsa"}],
        image_path="restaurants/demo/import/product_photo/taco.jpg",
        original_name="taco.jpg",
    )
    assert "abc-123" in prompt
    assert "taco.jpg" in prompt


def test_classify_photo_match_uses_product_id():
    matched, payload = _classify_photo_match(
        image_path="img.jpg",
        analysis={"product_id": "abc-123", "confidence": 0.91, "reason_es": "Claro"},
        threshold=0.72,
    )
    assert matched == "matched"
    assert payload["product_id"] == "abc-123"


class FakeVisionProvider:
    def __init__(self, responses: list[dict]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def analyze_json(self, request):
        data = self._responses[self.calls] if self.calls < len(self._responses) else {}
        self.calls += 1
        return VisionAnalysisResult(data=data, model="fake", raw_text=json.dumps(data))


@requires_db
def test_assign_and_match_product_photos(session):
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
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    assigned = skill.execute(
        "assign_product_image",
        {"storage_path": image_path, "product_id": str(product.id)},
        ctx,
    )
    assert assigned.ok is True
    loaded = uow.menu.get_product(product.id)
    assert loaded is not None
    assert loaded.image_path == image_path

    other_path = f"restaurants/{restaurant.id}/import/product_photo/unclear.jpg"
    vision = FakeVisionProvider(
        [
            {
                "product_id": str(product.id),
                "confidence": 0.91,
                "reason_es": "Taco al pastor visible",
            }
        ]
    )
    with patch(
        "app.modules.assistant.skills.menu_write.product_photos._load_image_bytes",
        return_value=(b"fake-image", "image/jpeg"),
    ), patch(
        "app.modules.assistant.skills.menu_write.product_photos.build_vision_provider",
        return_value=vision,
    ):
        matched = skill.execute(
            "match_product_photos",
            {"image_paths": [other_path]},
            ctx,
        )

    assert matched.ok is True
    assert len(matched.data["matched"]) == 1
    assert matched.data["matched"][0]["product_id"] == str(product.id)


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
    path_one = f"restaurants/{restaurant.id}/import/product_photo/agua.jpg"
    path_two = f"restaurants/{restaurant.id}/import/product_photo/refresco.jpg"

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
    assert uow.menu.get_product(first.id).image_path == path_one
    assert uow.menu.get_product(second.id).image_path == path_two
