import json
import uuid
from unittest.mock import patch

from app.core.pagination import PaginationParams
from app.core.vision.ports import VisionAnalysisResult
from app.db.models.assistant import AssistantConversation
from app.db.models.restaurant import Restaurant
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_import.apply_batch import apply_import_batch
from app.modules.assistant.skills.menu_import.description_enhance import (
    apply_description_enhancements,
    preview_description_enhancements,
)
from app.modules.assistant.skills.menu_import.photo_match import (
    _classify_match,
    apply_photo_mappings,
    match_photos_to_products,
    resolve_uncertain_image,
)
from app.modules.assistant.skills.menu_import.photo_match_prompt import build_photo_match_prompt
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.assistant.skills.menu_import.theme_tools import list_menu_themes, recommend_menu_theme
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRepository
from app.modules.menu.service import MenuService
from tests.conftest import requires_db


def test_build_photo_match_prompt_includes_catalog():
    prompt = build_photo_match_prompt(
        [{"ref": "prod_1", "name": "Taco", "description": "Con salsa"}],
        image_path="restaurants/demo/import/product_photo/taco.jpg",
        original_name="taco.jpg",
    )
    assert "prod_1" in prompt
    assert "taco.jpg" in prompt


def test_classify_match_uses_threshold():
    matched, payload = _classify_match(
        image_path="img.jpg",
        analysis={"product_ref": "prod_1", "confidence": 0.91, "reason_es": "Claro"},
        threshold=0.72,
    )
    assert matched == "matched"
    assert payload["product_ref"] == "prod_1"

    uncertain, _ = _classify_match(
        image_path="img.jpg",
        analysis={
            "product_ref": "prod_1",
            "confidence": 0.55,
            "candidates": [{"product_ref": "prod_1", "confidence": 0.55, "reason_es": "Tal vez"}],
            "reason_es": "Dudoso",
        },
        threshold=0.72,
    )
    assert uncertain == "uncertain"

    unmatched, _ = _classify_match(
        image_path="img.jpg",
        analysis={"product_ref": None, "confidence": 0.0, "reason_es": "No es comida"},
        threshold=0.72,
    )
    assert unmatched == "unmatched"


def _create_restaurant_and_conversation(session) -> tuple[uuid.UUID, uuid.UUID]:
    restaurant = Restaurant(name="Photo Import", subdomain=f"photo-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    conversation = AssistantConversation(restaurant_id=restaurant.id)
    session.add(conversation)
    session.flush()
    return restaurant.id, conversation.id


def _applied_batch_payload() -> dict:
    return {
        "batch_index": 0,
        "categories": [
            {
                "ref": "cat_tacos",
                "name": "Tacos",
                "sort_order": 0,
                "products": [
                    {
                        "ref": "prod_pastor",
                        "name": "Taco al Pastor",
                        "description": "Con piña",
                        "price_cents": 3500,
                        "option_groups": [],
                    }
                ],
            }
        ],
        "promotions": [],
        "global_rules": [],
        "open_questions": [],
    }


class FakeVisionProvider:
    def __init__(self, responses: list[dict]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def analyze_json(self, request):
        data = self._responses[self.calls] if self.calls < len(self._responses) else {}
        self.calls += 1
        return VisionAnalysisResult(data=data, model="fake", raw_text=json.dumps(data))


class FakeLLMProvider:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def stream_chat(self, request):
        from app.core.llm.ports import ChatStreamEvent

        yield ChatStreamEvent(
            event="message.complete",
            data={"content": json.dumps(self._payload, ensure_ascii=False)},
        )


@requires_db
def test_match_photos_classifies_matched_uncertain_unmatched(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.MATCHING_IMAGES,
    )
    import_session.draft_batches = [_applied_batch_payload()]
    repo.update(import_session)

    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    apply_import_batch(ctx, import_session, 0, confirmed=True)

    import_session.product_images = [
        {"path": f"restaurants/{restaurant_id}/import/product_photo/pastor.jpg", "original_name": "pastor.jpg"},
        {"path": f"restaurants/{restaurant_id}/import/product_photo/unclear.jpg", "original_name": "unclear.jpg"},
        {"path": f"restaurants/{restaurant_id}/import/product_photo/random.jpg", "original_name": "random.jpg"},
    ]
    repo.update(import_session)

    vision = FakeVisionProvider(
        [
            {"product_ref": "prod_pastor", "confidence": 0.91, "reason_es": "Taco al pastor visible"},
            {
                "product_ref": "prod_pastor",
                "confidence": 0.55,
                "candidates": [
                    {"product_ref": "prod_pastor", "confidence": 0.55, "reason_es": "Podría ser pastor"}
                ],
                "reason_es": "Ángulo difícil",
            },
            {"product_ref": None, "confidence": 0.0, "reason_es": "No es comida"},
        ]
    )

    with patch(
        "app.modules.assistant.skills.menu_import.photo_match._load_image_bytes",
        return_value=(b"fake-image", "image/jpeg"),
    ):
        result = match_photos_to_products(import_session, ctx, vision=vision)

    assert len(result.matched) == 1
    assert result.matched[0]["product_ref"] == "prod_pastor"
    assert len(result.uncertain) == 1
    assert len(result.unmatched) == 1


@requires_db
def test_resolve_uncertain_and_apply_photo_mappings(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.MATCHING_IMAGES,
    )
    import_session.draft_batches = [_applied_batch_payload()]
    image_path = f"restaurants/{restaurant_id}/import/product_photo/pastor.jpg"
    repo.update(import_session)

    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    apply_import_batch(ctx, import_session, 0, confirmed=True)

    import_session.product_images = [
        {
            "path": image_path,
            "original_name": "pastor.jpg",
            "status": "uncertain",
        }
    ]
    import_session.uncertain_images = [
        {
            "image_path": image_path,
            "candidates": [{"product_ref": "prod_pastor", "confidence": 0.55, "reason_es": "Posible pastor"}],
            "reason_es": "Ángulo difícil",
        }
    ]
    repo.update(import_session)

    resolve_uncertain_image(import_session, image_path, "prod_pastor")
    repo.update(import_session)

    apply_result = apply_photo_mappings(import_session, ctx, confirmed=True)
    assert apply_result.ok is True
    assert apply_result.updated == 1

    menu = MenuService(uow.menu)
    products = menu.list_products(restaurant_id, PaginationParams(limit=10, cursor=None))
    assert products.items[0].image_path == image_path


@requires_db
def test_preview_and_apply_description_enhancements(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.ENHANCING,
    )
    import_session.draft_batches = [_applied_batch_payload()]
    import_session.discovery_answers = {"cuisine": "Mexicana"}
    repo.update(import_session)

    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    apply_import_batch(ctx, import_session, 0, confirmed=True)
    product_id = import_session.draft_batches[0]["ref_map"]["prod_pastor"]

    llm = FakeLLMProvider(
        {
            "enhancements": [
                {
                    "product_id": product_id,
                    "proposed": "Taco al pastor jugoso con piña asada y cilantro.",
                }
            ]
        }
    )
    previews = preview_description_enhancements(import_session, ctx, llm=llm)
    assert len(previews) == 1
    assert previews[0].proposed.startswith("Taco al pastor")

    apply_result = apply_description_enhancements(
        import_session,
        ctx,
        confirmed=True,
        enhancements=previews,
    )
    assert apply_result.ok is True
    menu = MenuService(uow.menu)
    product = menu.get_product_by_id(restaurant_id, uuid.UUID(product_id))
    assert product.description == previews[0].proposed


@requires_db
def test_list_and_recommend_menu_themes(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    theme_repo = DigitalMenuThemeRepository(session)
    theme_repo.upsert(
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
    theme_repo.upsert(
        {
            "id": "minimal",
            "label": "Minimal",
            "description": "Clean minimal theme.",
            "best_for": ["Café"],
            "recommendation": "Simple menus.",
            "style_keywords": ["clean"],
            "is_active": True,
            "sort_order": 2,
        }
    )
    session.flush()

    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.SELECTING_THEME,
    )
    import_session.discovery_answers = {"cuisine": "Taquería mexicana"}
    repo.update(import_session)

    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    themes = list_menu_themes(ctx)
    assert {theme["id"] for theme in themes} >= {"taqueria-viva", "minimal"}

    llm = FakeLLMProvider(
        {
            "recommendations": [
                {"theme_id": "taqueria-viva", "reason_es": "Combina con taquería"},
                {"theme_id": "minimal", "reason_es": "Alternativa limpia"},
            ]
        }
    )
    recommendations = recommend_menu_theme(ctx, import_session, llm=llm)
    assert len(recommendations) == 2
    assert recommendations[0].theme_id == "taqueria-viva"
