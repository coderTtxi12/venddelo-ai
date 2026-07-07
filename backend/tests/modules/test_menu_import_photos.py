import json
import uuid
from unittest.mock import patch

from app.db.uow import SqlAlchemyUnitOfWork
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.apply_batch import apply_import_batch
from app.modules.assistant.skills.menu_import.description_enhance import (
    apply_description_enhancements,
    preview_description_enhancements,
)
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.assistant.skills.menu_import.theme_tools import list_menu_themes, recommend_menu_theme
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRepository
from tests.conftest import requires_db


def _create_restaurant_and_conversation(session) -> tuple[uuid.UUID, uuid.UUID]:
    from app.db.models.assistant import AssistantConversation
    from app.db.models.restaurant import Restaurant

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
                        "price_mxn": 35,
                        "option_groups": [],
                    }
                ],
            }
        ],
        "promotions": [],
        "global_rules": [],
        "open_questions": [],
    }


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
