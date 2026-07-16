from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from app.core.config import get_settings
from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, LLMProviderPort
from app.core.vision.ports import VisionAnalysisRequest, VisionPort
from app.infra.llm.factory import build_llm_provider
from app.infra.vision.factory import build_vision_provider
from app.modules.assistant.skills.menu_import.document_loader import VisionPage
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportProduct,
    OpenQuestion,
)
from app.modules.assistant.skills.menu_import.extraction_prompt import build_literal_ocr_prompt


def _vision_extraction_metadata(
    provider: VisionPort,
    *,
    models_used: list[str],
) -> dict[str, Any]:
    settings = get_settings()
    return {
        "extraction_mode": "vision",
        "vision_provider": settings.vision_provider,
        "configured_vision_model": settings.openai_vision_model,
        "models_used": models_used,
        "provider_class": provider.__class__.__name__,
    }


def _text_extraction_metadata(provider: LLMProviderPort) -> dict[str, Any]:
    settings = get_settings()
    return {
        "extraction_mode": "text",
        "llm_provider": settings.llm_provider,
        "configured_text_model": settings.openai_model,
        "provider_class": provider.__class__.__name__,
    }


def _normalize_name(name: str) -> str:
    ascii_name = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    )
    return re.sub(r"\s+", " ", ascii_name).strip().casefold()


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(key)
    return result


def _dedupe_open_questions(questions: list[OpenQuestion]) -> list[OpenQuestion]:
    seen: set[str] = set()
    result: list[OpenQuestion] = []
    for question in questions:
        key = question.id.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(question)
    return result


def _merge_products(existing: list[ImportProduct], incoming: list[ImportProduct]) -> list[ImportProduct]:
    by_name: dict[str, ImportProduct] = {}
    order: list[str] = []
    for product in existing + incoming:
        key = _normalize_name(product.name)
        if key not in by_name:
            by_name[key] = product
            order.append(key)
            continue
        current = by_name[key]
        merged_groups = current.option_groups + [
            group for group in product.option_groups if group not in current.option_groups
        ]
        by_name[key] = current.model_copy(
            update={
                "description": current.description or product.description,
                "option_groups": merged_groups,
                "constraints_notes": current.constraints_notes or product.constraints_notes,
            }
        )
    return [by_name[key] for key in order]


def merge_page_drafts(drafts: list[ImportDraft]) -> ImportDraft:
    """Merge per-page extraction results, deduplicating categories by normalized name."""
    from app.modules.assistant.skills.menu_import.draft_refs import ensure_unique_import_refs

    if not drafts:
        return ImportDraft()
    if len(drafts) == 1:
        return ensure_unique_import_refs(drafts[0])

    categories_by_name: dict[str, ImportCategory] = {}
    category_order: list[str] = []
    promotions = []
    global_rules: list[str] = []
    unmapped_text: list[str] = []
    open_questions: list[OpenQuestion] = []

    for draft in drafts:
        promotions.extend(draft.promotions)
        global_rules.extend(draft.global_rules)
        unmapped_text.extend(draft.unmapped_text)
        open_questions.extend(draft.open_questions)

        for category in draft.categories:
            key = _normalize_name(category.name)
            if key not in categories_by_name:
                categories_by_name[key] = category
                category_order.append(key)
                continue
            current = categories_by_name[key]
            categories_by_name[key] = current.model_copy(
                update={
                    "description": current.description or category.description,
                    "constraints_notes": current.constraints_notes or category.constraints_notes,
                    "products": _merge_products(current.products, category.products),
                }
            )

    return ensure_unique_import_refs(
        ImportDraft(
            categories=[categories_by_name[key] for key in category_order],
            promotions=promotions,
            global_rules=_dedupe_strings(global_rules),
            unmapped_text=_dedupe_strings(unmapped_text),
            open_questions=_dedupe_open_questions(open_questions),
        )
    )


def _collect_chat_json(provider: LLMProviderPort, request: ChatCompletionRequest) -> dict[str, Any]:
    content = ""
    for event in provider.stream_chat(request):
        if event.event == "message.complete":
            content = (event.data.get("content") or "").strip()
            break
    if not content:
        return {}
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def extract_literal_from_pages(
    pages: list[VisionPage],
    context: dict[str, Any],
    *,
    vision: VisionPort | None = None,
) -> tuple[ImportDraft, dict[str, Any]]:
    """Phase 1: vision OCR — literal transcription as printed."""
    if not pages:
        return ImportDraft(), _vision_extraction_metadata(
            vision or build_vision_provider(),
            models_used=[],
        )

    provider = vision or build_vision_provider()
    prompt = build_literal_ocr_prompt(context)
    page_drafts: list[ImportDraft] = []
    models_used: list[str] = []

    for page in pages:
        result = provider.analyze_json(
            VisionAnalysisRequest(
                prompt=prompt,
                image_bytes=page.image_bytes,
                image_media_type=page.media_type,
            )
        )
        models_used.append(result.model)
        page_drafts.append(ImportDraft.model_validate(result.data))

    return merge_page_drafts(page_drafts), _vision_extraction_metadata(
        provider,
        models_used=models_used,
    )


def extract_literal_from_text(
    text: str,
    context: dict[str, Any],
    *,
    llm: LLMProviderPort | None = None,
) -> tuple[ImportDraft, dict[str, Any]]:
    """Phase 1: literal transcription from plain text."""
    stripped = text.strip()
    provider = llm or build_llm_provider()
    if not stripped:
        return ImportDraft(), _text_extraction_metadata(provider)

    prompt = build_literal_ocr_prompt(context)
    data = _collect_chat_json(
        provider,
        ChatCompletionRequest(
            messages=[
                ChatCompletionMessage(role="system", content=prompt),
                ChatCompletionMessage(
                    role="user",
                    content=f"Transcribe this menu document:\n\n{stripped}",
                ),
            ],
            response_format="json_object",
        ),
    )
    return ImportDraft.model_validate(data), _text_extraction_metadata(provider)


def extract_from_pages(
    pages: list[VisionPage],
    context: dict[str, Any],
    *,
    vision: VisionPort | None = None,
    llm: LLMProviderPort | None = None,
) -> tuple[ImportDraft, dict[str, Any]]:
    """Literal OCR from vision pages. Modeling is disabled in the current import flow."""
    del llm
    return extract_literal_from_pages(pages, context, vision=vision)


def extract_from_text(
    text: str,
    context: dict[str, Any],
    *,
    llm: LLMProviderPort | None = None,
) -> tuple[ImportDraft, dict[str, Any]]:
    """Literal OCR from plain text. Modeling is disabled in the current import flow."""
    return extract_literal_from_text(text, context, llm=llm)


__all__ = [
    "extract_from_pages",
    "extract_from_text",
    "extract_literal_from_pages",
    "extract_literal_from_text",
    "merge_page_drafts",
]
