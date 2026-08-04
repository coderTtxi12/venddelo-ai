from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock

from app.core.config import get_settings
from app.core.storage import StorageError
from app.core.vision.ports import VisionAnalysisRequest, VisionAnalysisResult, VisionPort
from app.modules.assistant.import_asset_paths import import_inbox_prefix
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.ocr_bulk_products import (
    OCR_BULK_MAX_PATHS,
    normalize_bulk_product_items,
    ocr_menu_to_bulk_products,
)


class StubVision(VisionPort):
    def __init__(
        self,
        payloads: dict[str, dict[str, Any]] | None = None,
        *,
        fail: set[str] | None = None,
    ):
        self.payloads = payloads or {}
        self.fail = fail or set()
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
        # Tests pass a marker in prompt or use sequential payloads — simpler: key by call index
        raise NotImplementedError


class SequentialStubVision(VisionPort):
    def __init__(self, responses: list[dict[str, Any] | Exception]):
        self.responses = list(responses)
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
        assert request.model  # must pass OPENAI_VISION_MODEL
        next_item = self.responses.pop(0)
        if isinstance(next_item, Exception):
            raise next_item
        return VisionAnalysisResult(data=next_item, model=request.model or "stub", raw_text="{}")


class FakeStorage:
    def __init__(self, files: dict[str, bytes]):
        self.files = files

    def read(self, path: str) -> bytes:
        if path not in self.files:
            raise StorageError(f"missing {path}")
        return self.files[path]


def _ctx(restaurant_id: uuid.UUID | None = None) -> AgentContext:
    rid = restaurant_id or uuid.uuid4()
    return AgentContext(
        restaurant_id=rid,
        conversation_id=uuid.uuid4(),
        uow=MagicMock(),
        effective_skill_ids=["menu_write"],
    )


def test_normalize_requires_name_and_aliases_price_delta():
    items = normalize_bulk_product_items(
        {
            "items": [
                {
                    "name": "Taco",
                    "pricecents": 2500,
                    "option_groups": [
                        {
                            "title": "Extras",
                            "selection": "multi",
                            "items": [{"label": "Queso", "pricedeltacents": 1000}],
                        }
                    ],
                },
                {"price_cents": 100},  # drop — no name
            ]
        }
    )
    assert len(items) == 1
    assert items[0]["price_cents"] == 2500
    assert items[0]["option_groups"][0]["items"][0]["price_delta_cents"] == 1000
    assert "category_ids" not in items[0]


def test_ocr_rejects_too_many_paths():
    ctx = _ctx()
    prefix = import_inbox_prefix(ctx.restaurant_id)
    paths = [f"{prefix}{i}.webp" for i in range(OCR_BULK_MAX_PATHS + 1)]
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_paths": paths},
        vision=SequentialStubVision([]),
        storage=FakeStorage({}),
    )
    assert result.ok is False
    assert "at most" in result.summary.lower() or str(OCR_BULK_MAX_PATHS) in result.summary


def test_ocr_happy_path_single_image():
    ctx = _ctx()
    path = f"{import_inbox_prefix(ctx.restaurant_id)}menu.webp"
    vision = SequentialStubVision(
        [{"items": [{"name": "Agua", "price_cents": 3000, "category_names": ["Bebidas"]}]}]
    )
    storage = FakeStorage({path: b"fake-bytes"})
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_path": path},
        vision=vision,
        storage=storage,
    )
    assert result.ok is True
    assert result.data["item_count"] == 1
    assert result.data["items"][0]["name"] == "Agua"
    assert result.data["source_count"] == 1
    assert result.data["model"] == get_settings().openai_vision_model
    assert len(vision.calls) == 1
    assert vision.calls[0].image_bytes == b"fake-bytes"


def test_ocr_merges_two_images_and_collects_failures():
    from app.core.vision.ports import VisionError

    ctx = _ctx()
    p1 = f"{import_inbox_prefix(ctx.restaurant_id)}a.webp"
    p2 = f"{import_inbox_prefix(ctx.restaurant_id)}b.webp"
    p3 = f"{import_inbox_prefix(ctx.restaurant_id)}c.webp"
    vision = SequentialStubVision(
        [
            {"items": [{"name": "Uno", "price_cents": 100}]},
            VisionError("boom"),
            {"items": [{"name": "Dos", "price_cents": 200}]},
        ]
    )
    storage = FakeStorage({p1: b"1", p2: b"2", p3: b"3"})
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_paths": [p1, p2, p3]},
        vision=vision,
        storage=storage,
    )
    assert result.ok is True
    assert result.data["item_count"] == 2
    names = {i["name"] for i in result.data["items"]}
    assert names == {"Uno", "Dos"}
    assert any(f["storage_path"] == p2 for f in result.data["failed_paths"])


def test_ocr_invalid_path_does_not_call_vision():
    ctx = _ctx()
    vision = SequentialStubVision([])
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_path": "evil/path.webp"},
        vision=vision,
        storage=FakeStorage({}),
    )
    assert result.ok is False
    assert vision.calls == []
    assert result.data and result.data.get("failed_paths")
