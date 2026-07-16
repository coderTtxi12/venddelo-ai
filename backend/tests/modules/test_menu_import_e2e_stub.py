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
from app.modules.assistant.skills.context import AgentContext
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
                    "price_mxn": 35,
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
}


class StubVisionProvider(VisionPort):
    """Returns fixture JSON for extraction calls."""

    def __init__(self, *, extraction_payload: dict | None = None) -> None:
        self._extraction = extraction_payload or EXTRACTION_FIXTURE
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
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
        effective_skill_ids=["menu_import", "menu_write"],
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

    with (
        patch(
            "app.modules.assistant.skills.menu_import.extraction.build_vision_provider",
            return_value=stub_vision,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.load_menu_source_from_storage",
            side_effect=_fake_menu_source,
        ),
    ):
        start = _run(registry, "start_menu_import_session", {}, ctx)
        assert start.ok is True
        assert start.data["status"] == MenuImportSessionStatus.DISCOVERY.value

        context_saved = _run(
            registry,
            "save_menu_context",
            {"menu_context": "Menú de tacos al pastor, precios en MXN"},
            ctx,
        )
        assert context_saved.ok is True
        assert context_saved.data["status"] == MenuImportSessionStatus.COLLECTING_SOURCES.value

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
        assert extracted.data["draft_batches_applied"] == 1
        assert extracted.data["status"] == MenuImportSessionStatus.ENRICHING.value
        assert extracted.data["extracted_products"] == 1
        assert extracted.data["apply_enabled"] is False
        assert extracted.data["extraction_metadata"]["models_used"] == ["stub"]
        assert extracted.data["extraction_metadata"]["configured_vision_model"]

        assert extracted.data.get("live_menu_captured") is True
        assert extracted.data.get("live_menu_products") == 0
        assert extracted.data["products"] == 1

        status = _run(registry, "get_extraction_status", {"batch_index": 0}, ctx)
        assert status.ok is True
        assert status.data["preview"]["batch"]["categories"][0]["products"][0]["name"] == "Taco al Pastor"

    menu = MenuService(ctx.uow.menu)
    products = menu.list_products(restaurant_id, PaginationParams(limit=10, cursor=None))
    assert len(products.items) == 1

    active = ctx.uow.menu_import_sessions.get_active_for_restaurant(restaurant_id)
    assert active is not None
    assert active.live_menu_snapshot.get("source") == "live_menu"
    assert active.live_menu_snapshot.get("import_draft") is not None
