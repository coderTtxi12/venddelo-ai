"""End-to-end menu import flow using stub vision/LLM providers."""

from __future__ import annotations

import json
import uuid
from unittest.mock import patch

from app.core.pagination import PaginationParams
from app.core.vision.ports import VisionAnalysisRequest, VisionAnalysisResult, VisionPort
from app.db.models.assistant import AssistantConversation
from app.db.models.restaurant import Restaurant
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills import build_skill_registry
from app.modules.assistant.skills.menu_import.document_loader import MenuSourcePayload, VisionPage
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.menu.service import MenuService
from tests.conftest import requires_db


EXTRACTION_FIXTURE = {
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
                    "price_cents": 3500,
                    "currency": "MXN",
                    "is_available": True,
                    "option_groups": [],
                    "constraints_notes": None,
                }
            ],
        }
    ],
    "promotions": [],
    "global_rules": ["Precios en MXN"],
    "unmapped_text": [],
    "open_questions": [
        {
            "id": "q_promo",
            "question_es": "¿La promo 2x1 aplica los viernes?",
            "context": "Promo parcial en OCR",
            "related_refs": [],
        }
    ],
}


class StubVisionProvider(VisionPort):
    """Returns fixture JSON for extraction and photo-match calls."""

    def __init__(
        self,
        *,
        extraction_payload: dict | None = None,
        photo_match_payload: dict | None = None,
    ) -> None:
        self._extraction = extraction_payload or EXTRACTION_FIXTURE
        self._photo_match = photo_match_payload or {
            "product_ref": "prod_pastor",
            "confidence": 0.91,
            "reason_es": "Taco al pastor visible",
        }
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
        if "You match restaurant product photos" in request.prompt:
            data = self._photo_match
        else:
            data = self._extraction
        return VisionAnalysisResult(data=data, model="stub", raw_text=json.dumps(data))


def _fake_menu_source(_path: str, _mime: str) -> MenuSourcePayload:
    return MenuSourcePayload(
        pages=[VisionPage(image_bytes=b"fake-page", media_type="image/png")],
        text=None,
    )


def _create_context(session) -> tuple[AgentContext, uuid.UUID]:
    restaurant = Restaurant(name="E2E Import", subdomain=f"e2e-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    conversation = AssistantConversation(restaurant_id=restaurant.id)
    session.add(conversation)
    session.flush()

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=conversation.id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    return ctx, restaurant.id


def _run(registry, tool_name: str, args: dict, ctx: AgentContext):
    return registry.execute("menu_import", tool_name, args, ctx)


@requires_db
def test_menu_import_full_flow_stub(session):
    ctx, restaurant_id = _create_context(session)
    registry = build_skill_registry()
    stub_vision = StubVisionProvider()
    source_path = f"restaurants/{restaurant_id}/import/menu_source/menu.pdf"
    photo_path = f"restaurants/{restaurant_id}/import/product_photo/pastor.jpg"

    with (
        patch(
            "app.modules.assistant.skills.menu_import.extraction.build_vision_provider",
            return_value=stub_vision,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.photo_match.build_vision_provider",
            return_value=stub_vision,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.load_menu_source_from_storage",
            side_effect=_fake_menu_source,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.photo_match._load_image_bytes",
            return_value=(b"fake-image", "image/jpeg"),
        ),
    ):
        start = _run(registry, "start_menu_import_session", {}, ctx)
        assert start.ok is True
        assert start.data["status"] == MenuImportSessionStatus.DISCOVERY.value

        discovery = _run(
            registry,
            "save_discovery_answers",
            {"answers": {"cuisine": "Mexicana", "currency": "MXN"}},
            ctx,
        )
        assert discovery.ok is True
        assert discovery.data["status"] == MenuImportSessionStatus.COLLECTING_SOURCES.value

        registered = _run(
            registry,
            "register_menu_source_file",
            {
                "storage_path": source_path,
                "mime_type": "application/pdf",
                "original_name": "menu.pdf",
            },
            ctx,
        )
        assert registered.ok is True
        assert registered.data["source_files"] == 1

        extracted = _run(registry, "start_menu_extraction_batch", {}, ctx)
        assert extracted.ok is True
        assert extracted.data["draft_batches_total"] == 1
        assert extracted.data["status"] == MenuImportSessionStatus.CLARIFYING.value
        assert extracted.data["open_questions"]

        clarified = _run(
            registry,
            "save_clarification_answers",
            {"answers": {"q_promo": "Solo viernes de 18:00 a 22:00"}},
            ctx,
        )
        assert clarified.ok is True
        assert clarified.data["status"] == MenuImportSessionStatus.COLLECTING_IMAGES.value
        assert clarified.data["unanswered_question_ids"] == []

        applied = _run(
            registry,
            "apply_menu_batch",
            {"batch_index": 0, "confirmed": True},
            ctx,
        )
        assert applied.ok is True
        assert applied.data["products"] == 1
        assert applied.data["status"] == MenuImportSessionStatus.MATCHING_IMAGES.value

        photo_registered = _run(
            registry,
            "register_product_image",
            {"storage_path": photo_path, "original_name": "pastor.jpg"},
            ctx,
        )
        assert photo_registered.ok is True

        matched = _run(registry, "match_photos_to_products", {}, ctx)
        assert matched.ok is True
        assert len(matched.data["matched"]) == 1
        assert matched.data["matched"][0]["product_ref"] == "prod_pastor"

        mappings = _run(registry, "apply_photo_mappings", {"confirmed": True}, ctx)
        assert mappings.ok is True
        assert mappings.data["updated"] == 1

    menu = MenuService(ctx.uow.menu)
    products = menu.list_products(restaurant_id, PaginationParams(limit=10, cursor=None))
    assert len(products.items) == 1
    assert products.items[0].name == "Taco al Pastor"
    assert products.items[0].image_path == photo_path

    active = ctx.uow.menu_import_sessions.get_active_for_restaurant(restaurant_id)
    assert active is not None
    assert active.draft_batches[0]["applied_at"]
    assert active.draft_batches[0]["ref_map"]["prod_pastor"] == str(products.items[0].id)
