from __future__ import annotations

import json
from collections.abc import Iterator

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.core.vision.ports import VisionAnalysisRequest, VisionAnalysisResult, VisionPort
from app.modules.assistant.skills.menu_import.document_loader import VisionPage
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportProduct,
    OpenQuestion,
)
from app.modules.assistant.skills.menu_import.extraction import (
    extract_from_pages,
    extract_from_text,
    merge_page_drafts,
)
from app.modules.assistant.skills.menu_import.extraction_prompt import build_extraction_prompt


TAQUERIA_FIXTURE = {
    "categories": [
        {
            "ref": "cat_1",
            "name": "Tacos",
            "description": None,
            "sort_order": 0,
            "products": [
                {
                    "ref": "prod_1",
                    "name": "Pastor",
                    "description": "Con piña",
                    "price_cents": 8500,
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
    "open_questions": [],
}

PAGE_TWO_FIXTURE = {
    "categories": [
        {
            "ref": "cat_2",
            "name": "TACOS",
            "description": None,
            "sort_order": 1,
            "products": [
                {
                    "ref": "prod_2",
                    "name": "Suadero",
                    "description": None,
                    "price_cents": 9000,
                    "currency": "MXN",
                    "is_available": True,
                    "option_groups": [],
                    "constraints_notes": None,
                }
            ],
        },
        {
            "ref": "cat_3",
            "name": "Bebidas",
            "description": None,
            "sort_order": 2,
            "products": [
                {
                    "ref": "prod_3",
                    "name": "Agua",
                    "description": None,
                    "price_cents": 2500,
                    "currency": "MXN",
                    "is_available": True,
                    "option_groups": [],
                    "constraints_notes": None,
                }
            ],
        },
    ],
    "promotions": [],
    "global_rules": ["Precios en MXN"],
    "unmapped_text": ["Nota ilegible"],
    "open_questions": [
        {
            "id": "q1",
            "question_es": "¿La promo 2x1 aplica los viernes?",
            "context": "Promo parcial",
            "related_refs": [],
        }
    ],
}


class FixtureVisionProvider(VisionPort):
    def __init__(self, responses: list[dict] | None = None) -> None:
        self._responses = list(responses or [TAQUERIA_FIXTURE])
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
        index = min(len(self.calls) - 1, len(self._responses) - 1)
        data = self._responses[index]
        return VisionAnalysisResult(data=data, model="fixture", raw_text=json.dumps(data))


class FixtureLLMProvider(LLMProviderPort):
    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.requests: list[ChatCompletionRequest] = []

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        self.requests.append(request)
        yield ChatStreamEvent(
            event="message.complete",
            data={"content": json.dumps(self._payload), "usage": {}},
        )


def test_extraction_prompt_includes_discovery_context():
    prompt = build_extraction_prompt(
        {"discovery_answers": {"currency": "USD", "cuisine_type": "taqueria"}}
    )
    assert "USD" in prompt
    assert "taqueria" in prompt
    assert "Transcribe literally" in prompt


def test_extraction_parses_taqueria_fixture():
    draft = extract_from_pages(
        [VisionPage(image_bytes=b"fake-png", media_type="image/png")],
        context={},
        vision=FixtureVisionProvider(),
    )
    assert draft.categories[0].products[0].price_cents == 8500
    assert draft.categories[0].products[0].name == "Pastor"


def test_merge_page_drafts_dedupes_categories_by_name():
    draft = merge_page_drafts(
        [
            ImportDraft.model_validate(TAQUERIA_FIXTURE),
            ImportDraft.model_validate(PAGE_TWO_FIXTURE),
        ]
    )
    names = [category.name for category in draft.categories]
    assert names == ["Tacos", "Bebidas"]
    taco_products = draft.categories[0].products
    assert {product.name for product in taco_products} == {"Pastor", "Suadero"}
    assert draft.global_rules == ["Precios en MXN"]
    assert len(draft.open_questions) == 1
    assert draft.unmapped_text == ["Nota ilegible"]


def test_extract_from_text_uses_llm_json():
    draft = extract_from_text(
        "Tacos\nPastor $85",
        context={"discovery_answers": {"currency": "MXN"}},
        llm=FixtureLLMProvider(TAQUERIA_FIXTURE),
    )
    assert draft.categories[0].products[0].price_cents == 8500


def test_merge_page_drafts_empty():
    assert merge_page_drafts([]) == ImportDraft()


def test_extract_from_pages_merges_multiple_pages():
    vision = FixtureVisionProvider([TAQUERIA_FIXTURE, PAGE_TWO_FIXTURE])
    pages = [
        VisionPage(image_bytes=b"page-1", media_type="image/png"),
        VisionPage(image_bytes=b"page-2", media_type="image/png"),
    ]
    draft = extract_from_pages(pages, context={}, vision=vision)
    assert len(vision.calls) == 2
    assert _product_count(draft) == 3


def _product_count(draft: ImportDraft) -> int:
    return sum(len(category.products) for category in draft.categories)
