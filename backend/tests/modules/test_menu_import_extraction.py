from __future__ import annotations

import json
from collections.abc import Iterator

from app.core.llm.ports import ChatCompletionRequest, ChatStreamEvent, LLMProviderPort
from app.core.vision.ports import VisionAnalysisRequest, VisionAnalysisResult, VisionPort
from app.modules.assistant.skills.menu_import.document_loader import VisionPage
from app.modules.assistant.skills.menu_import.draft_modeling import model_import_draft
from app.modules.assistant.skills.menu_import.draft_schema import ImportDraft
from app.modules.assistant.skills.menu_import.extraction import (
    extract_from_pages,
    extract_from_text,
    extract_literal_from_pages,
    merge_page_drafts,
)
from app.modules.assistant.skills.menu_import.extraction_prompt import (
    build_extraction_prompt,
    build_literal_ocr_prompt,
    build_modeling_prompt,
)


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
                    "price_mxn": 85,
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

LITERAL_ALITAS_FIXTURE = {
    "categories": [
        {
            "ref": "cat_1",
            "name": "ALITAS",
            "description": None,
            "sort_order": 0,
            "products": [
                {"ref": "prod_1", "name": "8 piezas", "description": None, "price_mxn": 125, "currency": "MXN", "is_available": True, "option_groups": [], "constraints_notes": None},
                {"ref": "prod_2", "name": "12 piezas", "description": None, "price_mxn": 175, "currency": "MXN", "is_available": True, "option_groups": [], "constraints_notes": None},
            ],
        }
    ],
    "promotions": [],
    "global_rules": ["Sabores: BBQ, Buffalo"],
    "unmapped_text": [],
    "open_questions": [],
}

MODELED_ALITAS_FIXTURE = {
    "categories": [
        {
            "ref": "cat_1",
            "name": "Alitas",
            "description": None,
            "sort_order": 0,
            "products": [
                {
                    "ref": "prod_1",
                    "name": "Alitas",
                    "description": None,
                    "price_mxn": 125,
                    "currency": "MXN",
                    "is_available": True,
                    "option_groups": [
                        {
                            "ref": "og_1",
                            "title": "Cantidad",
                            "selection": "single",
                            "required": True,
                            "min_selections": 1,
                            "max_selections": 1,
                            "items": [
                                {"ref": "oi_1", "label": "8 piezas", "price_delta_mxn": 0},
                                {"ref": "oi_2", "label": "12 piezas", "price_delta_mxn": 50},
                            ],
                        }
                    ],
                    "constraints_notes": None,
                }
            ],
        }
    ],
    "promotions": [],
    "global_rules": [],
    "unmapped_text": [],
    "open_questions": [],
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
    def __init__(self, responses: list[dict] | dict) -> None:
        if isinstance(responses, dict):
            self._responses = [responses]
        else:
            self._responses = list(responses)
        self.requests: list[ChatCompletionRequest] = []

    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]:
        self.requests.append(request)
        index = min(len(self.requests) - 1, len(self._responses) - 1)
        payload = self._responses[index]
        yield ChatStreamEvent(
            event="message.complete",
            data={"content": json.dumps(payload), "usage": {}},
        )


def test_literal_ocr_prompt_does_not_apply_owner_context():
    prompt = build_literal_ocr_prompt(
        {"menu_context": "Consolidate all wing sizes into one product"}
    )
    assert "Owner instructions" not in prompt
    assert "Consolidate all wing sizes" not in prompt


def test_modeling_prompt_includes_owner_context():
    prompt = build_modeling_prompt({"owner_instructions": "One product per dish with Tamaño group"})
    assert "One product per dish with Tamaño group" in prompt
    assert "ADDITIONAL OWNER INSTRUCTIONS:" in prompt


def test_extraction_prompt_is_modeling_alias():
    assert build_extraction_prompt({}) == build_modeling_prompt({})


def test_extraction_prompt_includes_product_modeling_rules():
    prompt = build_modeling_prompt({})
    assert "RESTRUCTURING" in prompt
    assert "price_delta_mxn" in prompt
    assert "option_groups" in prompt


def test_extraction_prompt_includes_discovery_context():
    prompt = build_modeling_prompt(
        {"discovery_answers": {"currency": "USD", "cuisine_type": "taqueria"}}
    )
    assert "MXN" in prompt
    assert "USD" not in prompt
    assert "taqueria" in prompt
    assert "price_mxn" in prompt


def test_model_import_draft_restructures_literal():
    literal = ImportDraft.model_validate(LITERAL_ALITAS_FIXTURE)
    modeled = model_import_draft(
        literal,
        {"menu_context": "Consolidate sizes into one Alitas product"},
        llm=FixtureLLMProvider(MODELED_ALITAS_FIXTURE),
    )
    assert modeled.categories[0].products[0].name == "Alitas"
    assert modeled.categories[0].products[0].option_groups[0].title == "Cantidad"


def test_extract_from_pages_runs_literal_ocr_only():
    vision = FixtureVisionProvider([LITERAL_ALITAS_FIXTURE])
    llm = FixtureLLMProvider(MODELED_ALITAS_FIXTURE)
    draft, metadata = extract_from_pages(
        [VisionPage(image_bytes=b"fake-png", media_type="image/png")],
        context={"menu_context": "Consolidate sizes"},
        vision=vision,
        llm=llm,
    )
    assert "menu OCR and catalog mapping engine" in vision.calls[0].prompt
    assert draft.categories[0].products[0].name == "8 piezas"
    assert len(llm.requests) == 0
    assert metadata["models_used"] == ["fixture"]
    assert metadata["provider_class"] == "FixtureVisionProvider"


def test_extraction_parses_taqueria_fixture():
    draft, metadata = extract_from_pages(
        [VisionPage(image_bytes=b"fake-png", media_type="image/png")],
        context={},
        vision=FixtureVisionProvider(),
        llm=FixtureLLMProvider(TAQUERIA_FIXTURE),
    )
    assert draft.categories[0].products[0].price_mxn == 85
    assert draft.categories[0].products[0].name == "Pastor"
    assert metadata["extraction_mode"] == "vision"


def test_extract_from_text_uses_literal_ocr_only():
    draft, metadata = extract_from_text(
        "Tacos\nPastor $85",
        context={"discovery_answers": {"currency": "MXN"}},
        llm=FixtureLLMProvider([TAQUERIA_FIXTURE, TAQUERIA_FIXTURE]),
    )
    assert len(draft.categories) == 1
    assert draft.categories[0].products[0].price_mxn == 85
    assert metadata["extraction_mode"] == "text"


def test_merge_page_drafts_empty():
    assert merge_page_drafts([]) == ImportDraft()


def test_merge_page_drafts_dedupes_categories_by_name():
    page_two = {
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
                        "price_mxn": 90,
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
    draft = merge_page_drafts(
        [
            ImportDraft.model_validate(TAQUERIA_FIXTURE),
            ImportDraft.model_validate(page_two),
        ]
    )
    assert [category.name for category in draft.categories] == ["Tacos"]
    assert {product.name for product in draft.categories[0].products} == {"Pastor", "Suadero"}


def test_modeling_prompt_separates_description_from_selection_rules():
    prompt = build_modeling_prompt({})
    assert "description" in prompt.casefold()
    assert "min_selections" in prompt.casefold()
    assert "global_rules" in prompt


def test_literal_ocr_prompt_captures_footnotes_for_description():
    prompt = build_literal_ocr_prompt({})
    assert "global_rules" in prompt
    assert "menu-wide" in prompt.casefold() or "global" in prompt.casefold()


def test_modeling_prompt_requires_full_literal_passthrough():
    prompt = build_modeling_prompt({"owner_instructions": "only restructure product X"})
    assert "every" in prompt.casefold() and "category" in prompt.casefold()
    assert "never silently omit" in prompt.casefold()


def test_extract_literal_from_pages_uses_literal_prompt():
    vision = FixtureVisionProvider()
    extract_literal_from_pages(
        [VisionPage(image_bytes=b"page-1", media_type="image/png")],
        context={},
        vision=vision,
    )
    assert "menu OCR and catalog mapping engine" in vision.calls[0].prompt
