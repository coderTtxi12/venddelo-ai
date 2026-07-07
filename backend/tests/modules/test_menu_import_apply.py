import uuid
from unittest.mock import MagicMock

from app.core.pagination import PaginationParams
from app.db.models.assistant import AssistantConversation
from app.db.models.restaurant import Restaurant
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_import.apply_batch import (
    ApplyBatchResult,
    ApplyFullResult,
    _unanswered_question_ids,
    apply_full_import,
    apply_import_batch,
)
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, OpenQuestion
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.assistant.skills.menu_import.theme_tools import apply_menu_theme
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRepository
from app.modules.menu.service import MenuService
from app.modules.promotions.service import PromotionService
from tests.conftest import requires_db


def test_unanswered_question_ids():
    batch = ImportBatch(
        batch_index=0,
        open_questions=[
            OpenQuestion(id="q1", question_es="¿Precio?"),
            OpenQuestion(id="q2", question_es="¿Horario?"),
        ],
    )
    assert _unanswered_question_ids(batch, {"q1": "100"}) == ["q2"]
    assert _unanswered_question_ids(batch, {"q1": "100", "q2": "Viernes"}) == []


def test_apply_import_batch_rejects_unconfirmed_without_db():
    uow = MagicMock()
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    session = MagicMock()
    session.draft_batches = [
        {"batch_index": 0, "categories": [], "promotions": [], "open_questions": []}
    ]
    session.clarification_answers = {}

    result = apply_import_batch(ctx, session, 0, confirmed=False)
    assert isinstance(result, ApplyBatchResult)
    assert result.ok is False


def _create_restaurant_and_conversation(session) -> tuple[uuid.UUID, uuid.UUID]:
    restaurant = Restaurant(name="Apply Import", subdomain=f"apply-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    conversation = AssistantConversation(restaurant_id=restaurant.id)
    session.add(conversation)
    session.flush()
    return restaurant.id, conversation.id


def _sample_batch_payload() -> dict:
    return {
        "batch_index": 0,
        "categories": [
            {
                "ref": "cat_tacos",
                "name": "Tacos",
                "description": "Clásicos",
                "sort_order": 0,
                "products": [
                    {
                        "ref": "prod_pastor",
                        "name": "Taco al Pastor",
                        "description": "Con piña",
                        "price_mxn": 35,
                        "currency": "MXN",
                        "is_available": True,
                        "option_groups": [
                            {
                                "ref": "og_salsa",
                                "title": "Salsa",
                                "selection": "single",
                                "required": False,
                                "min_selections": 0,
                                "max_selections": 1,
                                "items": [
                                    {
                                        "ref": "oi_verde",
                                        "label": "Verde",
                                        "price_delta_mxn": 0,
                                    }
                                ],
                            }
                        ],
                    },
                    {
                        "ref": "prod_asada",
                        "name": "Taco de Asada",
                        "description": None,
                        "price_mxn": 40,
                        "currency": "MXN",
                        "is_available": True,
                        "option_groups": [],
                    },
                ],
            }
        ],
        "promotions": [
            {
                "ref": "promo_2x1",
                "name": "2x1 Tacos",
                "type": "two_for_one",
                "scope": "product",
                "bundle": {
                    "get_quantity": 2,
                    "pay_quantity": 1,
                    "pairing_mode": "cross_product",
                },
                "target_product_refs": ["prod_pastor", "prod_asada"],
            }
        ],
        "global_rules": [],
        "open_questions": [],
    }


def test_apply_full_import_rejects_unconfirmed_without_db():
    uow = MagicMock()
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    session = MagicMock()
    session.draft_batches = [
        {"batch_index": 0, "categories": [], "promotions": [], "open_questions": []}
    ]
    session.clarification_answers = {}

    result = apply_full_import(ctx, session, confirmed=False)
    assert isinstance(result, ApplyFullResult)
    assert result.ok is False


@requires_db
def test_apply_full_import_applies_all_pending_batches(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.PREVIEW_BATCH,
    )
    batch = _sample_batch_payload()
    import_session.draft_batches = [
        batch,
        {
            **batch,
            "batch_index": 1,
            "categories": [
                {
                    "ref": "cat_bebidas",
                    "name": "Bebidas",
                    "sort_order": 1,
                    "products": [
                        {
                            "ref": "prod_agua",
                            "name": "Agua",
                            "price_mxn": 20,
                            "currency": "MXN",
                            "is_available": True,
                            "option_groups": [],
                        }
                    ],
                }
            ],
            "promotions": [],
        },
    ]
    repo.update(import_session)
    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    result = apply_full_import(ctx, import_session, confirmed=True)

    assert result.ok is True
    assert result.batches_applied == 2
    assert result.products == 3
    assert import_session.draft_batches[0]["applied_at"]
    assert import_session.draft_batches[1]["applied_at"]


@requires_db
def test_apply_import_batch_publishes_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.PREVIEW_BATCH,
    )
    import_session.draft_batches = [_sample_batch_payload()]
    repo.update(import_session)

    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    result = apply_import_batch(ctx, import_session, 0, confirmed=True)

    assert result.ok is True
    assert result.categories == 1
    assert result.products == 2
    assert result.option_groups == 1
    assert result.option_items == 1
    assert result.promotions == 1
    assert result.ref_map["prod_pastor"]
    assert result.ref_map["oi_verde"]

    menu = MenuService(uow.menu)
    categories = menu.list_all_categories(
        restaurant_id, PaginationParams(limit=50, cursor=None)
    )
    assert len(categories.items) == 1
    assert categories.items[0].name == "Tacos"

    products = menu.list_products(
        restaurant_id, PaginationParams(limit=50, cursor=None)
    )
    assert len(products.items) == 2
    pastor = next(item for item in products.items if item.name == "Taco al Pastor")
    assert pastor.price_cents == 3500
    assert pastor.is_published is True
    assert pastor.option_groups
    assert pastor.option_groups[0].items[0].label == "Verde"

    promos = PromotionService(uow.promotions).list_active(
        restaurant_id, PaginationParams(limit=50, cursor=None)
    )
    assert len(promos.items) == 1
    assert promos.items[0].name == "2x1 Tacos"

    assert import_session.draft_batches[0]["applied_at"]
    assert import_session.draft_batches[0]["ref_map"]["prod_pastor"] == str(pastor.id)


@requires_db
def test_apply_full_import_reconciles_existing_menu_without_duplicates(session):
    from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch
    from app.modules.assistant.skills.menu_import.menu_reconcile import (
        build_reconciliation_plan,
    )

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    # First import creates the menu.
    first_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.PREVIEW_BATCH,
    )
    first_session.draft_batches = [_sample_batch_payload()]
    repo.update(first_session)
    assert apply_full_import(ctx, first_session, confirmed=True).ok is True

    menu = MenuService(uow.menu)
    products_before = menu.list_products(restaurant_id, PaginationParams(limit=50, cursor=None))
    assert len(products_before.items) == 2

    # Second import of the same menu (higher price) must update, not duplicate.
    second_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.PREVIEW_BATCH,
    )
    reimport = _sample_batch_payload()
    reimport["categories"][0]["products"][0]["price_mxn"] = 45
    second_session.draft_batches = [reimport]
    repo.update(second_session)

    draft = ImportBatch.model_validate(reimport)
    from app.modules.assistant.skills.menu_import.draft_schema import ImportDraft

    plan = build_reconciliation_plan(
        ImportDraft(categories=draft.categories, promotions=draft.promotions),
        menu.get_full_menu(restaurant_id),
    )
    assert plan.reused_categories == 1
    assert plan.updated_products == 2

    result = apply_full_import(ctx, second_session, confirmed=True, reconciliation=plan)
    assert result.ok is True

    categories_after = menu.list_all_categories(
        restaurant_id, PaginationParams(limit=50, cursor=None)
    )
    assert len(categories_after.items) == 1  # no duplicate category
    products_after = menu.list_products(restaurant_id, PaginationParams(limit=50, cursor=None))
    assert len(products_after.items) == 2  # no duplicate products
    pastor = next(item for item in products_after.items if item.name == "Taco al Pastor")
    assert pastor.price_cents == 4500  # updated price
    # complements not duplicated on the already-configured product
    assert len(pastor.option_groups) == 1


@requires_db
def test_apply_import_batch_rejects_unconfirmed(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.PREVIEW_BATCH,
    )
    import_session.draft_batches = [_sample_batch_payload()]
    repo.update(import_session)
    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    result = apply_import_batch(ctx, import_session, 0, confirmed=False)

    assert result.ok is False
    assert "confirmed" in result.summary


@requires_db
def test_apply_import_batch_rejects_unanswered_open_questions(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    repo = MenuImportSessionRepository(session)
    batch = _sample_batch_payload()
    batch["open_questions"] = [
        OpenQuestion(
            id="q_price",
            question_es="¿Cuál es el precio del combo?",
            context="Ambiguo en OCR",
        ).model_dump()
    ]
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.CLARIFYING,
    )
    import_session.draft_batches = [batch]
    repo.update(import_session)
    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    result = apply_import_batch(ctx, import_session, 0, confirmed=True)

    assert result.ok is False
    assert "q_price" in result.summary


@requires_db
def test_apply_menu_theme_updates_restaurant(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant_id, conversation_id = _create_restaurant_and_conversation(session)
    DigitalMenuThemeRepository(session).upsert(
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
    session.flush()

    repo = MenuImportSessionRepository(session)
    import_session = repo.create(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        status=MenuImportSessionStatus.SELECTING_THEME,
    )
    ctx = AgentContext(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )

    payload = apply_menu_theme(ctx, "taqueria-viva", session=import_session)

    assert payload["theme_id"] == "taqueria-viva"
    restaurant = uow.restaurants.get(restaurant_id)
    assert restaurant is not None
    assert restaurant.digital_menu_theme_id == "taqueria-viva"
    assert import_session.selected_theme_id == "taqueria-viva"
