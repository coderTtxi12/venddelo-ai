from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, LLMProviderPort
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportOptionItem,
    ImportProduct,
)
from app.modules.assistant.skills.menu_import.complement_heuristics import apply_complement_heuristics
from app.modules.assistant.skills.menu_import.optimization_prompt import build_optimization_prompt

_VALID_LAYOUTS = frozenset({"vertical", "horizontal", "grid"})
_VALID_SELECTION = frozenset({"single", "multi"})


@dataclass(frozen=True, slots=True)
class OptimizationResult:
    draft: ImportDraft
    optimization_notes_es: list[str]
    recommended_theme_id: str | None


def _apply_overrides[T](base: T, overrides: dict[str, Any], fields: tuple[str, ...]) -> T:
    updates = {key: overrides[key] for key in fields if key in overrides and overrides[key] is not None}
    return base.model_copy(update=updates) if updates else base


def _merge_option_item(base: ImportOptionItem, override: dict[str, Any]) -> ImportOptionItem:
    updates: dict[str, Any] = {}
    if override.get("sort_order") is not None:
        updates["sort_order"] = int(override["sort_order"])
    if override.get("price_delta_mxn") is not None:
        updates["price_delta_mxn"] = float(override["price_delta_mxn"])
    return base.model_copy(update=updates) if updates else base


def _merge_option_group(base: ImportOptionGroup, override: dict[str, Any]) -> ImportOptionGroup:
    item_overrides = {
        str(item["ref"]): item
        for item in (override.get("items") or [])
        if isinstance(item, dict) and item.get("ref")
    }
    items = [
        _merge_option_item(item, item_overrides.get(item.ref, {}))
        for item in base.items
    ]
    items.sort(key=lambda item: (item.sort_order, item.label))

    updates: dict[str, Any] = {"items": items}
    if override.get("sort_order") is not None:
        updates["sort_order"] = int(override["sort_order"])
    if override.get("required") is not None:
        updates["required"] = bool(override["required"])
    selection = override.get("selection")
    if selection in _VALID_SELECTION:
        updates["selection"] = selection
    if override.get("min_selections") is not None:
        updates["min_selections"] = int(override["min_selections"])
    if override.get("max_selections") is not None:
        updates["max_selections"] = int(override["max_selections"])
    return base.model_copy(update=updates)


def _merge_product(base: ImportProduct, override: dict[str, Any]) -> ImportProduct:
    group_overrides = {
        str(group["ref"]): group
        for group in (override.get("option_groups") or [])
        if isinstance(group, dict) and group.get("ref")
    }
    groups = [
        _merge_option_group(group, group_overrides.get(group.ref, {}))
        for group in base.option_groups
    ]
    groups.sort(key=lambda group: (group.sort_order, group.title))

    updates: dict[str, Any] = {"option_groups": groups}
    if override.get("sort_order") is not None:
        updates["sort_order"] = int(override["sort_order"])
    if override.get("description") is not None:
        updates["description"] = str(override["description"])
    return base.model_copy(update=updates)


def _merge_category(base: ImportCategory, override: dict[str, Any]) -> ImportCategory:
    product_overrides = {
        str(product["ref"]): product
        for product in (override.get("products") or [])
        if isinstance(product, dict) and product.get("ref")
    }
    products = [
        _merge_product(product, product_overrides.get(product.ref, {}))
        for product in base.products
    ]
    products.sort(key=lambda product: (product.sort_order, product.name))

    updates: dict[str, Any] = {"products": products}
    if override.get("sort_order") is not None:
        updates["sort_order"] = int(override["sort_order"])
    layout = override.get("display_layout")
    if layout in _VALID_LAYOUTS:
        updates["display_layout"] = layout
    return base.model_copy(update=updates)


def parse_optimization_response(base: ImportDraft, raw: dict[str, Any]) -> OptimizationResult:
    category_payloads = {
        str(item["ref"]): item
        for item in (raw.get("categories") or [])
        if isinstance(item, dict) and item.get("ref")
    }
    categories = [
        _merge_category(category, category_payloads.get(category.ref, {}))
        for category in base.categories
    ]
    categories.sort(key=lambda category: (category.sort_order, category.name))
    notes = [
        str(item).strip()
        for item in (raw.get("optimization_notes_es") or [])
        if str(item).strip()
    ]
    theme_id = raw.get("recommended_theme_id")
    recommended = str(theme_id).strip() if theme_id else None
    return OptimizationResult(
        draft=base.model_copy(update={"categories": categories}),
        optimization_notes_es=notes,
        recommended_theme_id=recommended or None,
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


def optimize_draft(
    draft: ImportDraft,
    context: dict[str, Any],
    *,
    llm: LLMProviderPort | None = None,
) -> OptimizationResult:
    baseline = apply_complement_heuristics(draft)
    provider = llm or build_llm_provider()
    prompt = build_optimization_prompt(baseline.model_dump(), context)
    raw = _collect_chat_json(
        provider,
        ChatCompletionRequest(
            messages=[ChatCompletionMessage(role="user", content=prompt)],
            response_format={"type": "json_object"},
        ),
    )
    if not raw:
        return OptimizationResult(
            draft=baseline,
            optimization_notes_es=[],
            recommended_theme_id=None,
        )
    result = parse_optimization_response(baseline, raw)
    return OptimizationResult(
        draft=apply_complement_heuristics(result.draft),
        optimization_notes_es=result.optimization_notes_es,
        recommended_theme_id=result.recommended_theme_id,
    )
