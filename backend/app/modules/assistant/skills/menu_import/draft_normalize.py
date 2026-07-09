"""Normalize LLM extraction JSON before ImportDraft / ImportBatch validation."""

from __future__ import annotations

from typing import Any

_LIST_FIELDS = frozenset(
    {
        "categories",
        "products",
        "option_groups",
        "items",
        "promotions",
        "global_rules",
        "unmapped_text",
        "open_questions",
        "target_product_refs",
        "target_category_refs",
        "eligible_option_item_refs",
        "participating_complements",
        "excluded_complements",
        "related_refs",
        "weekdays",
    }
)

_NUMERIC_DEFAULTS = frozenset(
    {
        "price_mxn",
        "price_delta_mxn",
        "sort_order",
        "min_selections",
        "get_quantity",
        "pay_quantity",
        "batch_index",
    }
)

_BOOL_DEFAULT_VALUES = {
    "required": False,
    "is_available": True,
    "use_time_window": False,
}

_OPTIONAL_NULLABLE_NUMERIC = frozenset({"percent", "amount_mxn", "max_selections"})


def _default_for_numeric(key: str) -> float | int:
    defaults: dict[str, float | int] = {
        "get_quantity": 2,
        "pay_quantity": 1,
        "batch_index": 0,
    }
    return defaults.get(key, 0)


def _coerce_numeric(value: Any, *, default: float | int) -> float | int:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        cleaned = value.strip().replace("$", "").replace(",", "")
        if not cleaned:
            return default
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default


def normalize_import_draft_payload(data: Any) -> Any:
    if isinstance(data, list):
        return [normalize_import_draft_payload(item) for item in data]
    if not isinstance(data, dict):
        return data

    normalized: dict[str, Any] = {}
    for key, value in data.items():
        if key in _LIST_FIELDS and value is None:
            normalized[key] = []
            continue

        if key in _NUMERIC_DEFAULTS and (value is None or value == ""):
            normalized[key] = _default_for_numeric(key)
            continue

        if key in _BOOL_DEFAULT_VALUES and value is None:
            normalized[key] = _BOOL_DEFAULT_VALUES[key]
            continue

        if key in _OPTIONAL_NULLABLE_NUMERIC:
            if value is None or value == "":
                normalized[key] = None
            elif isinstance(value, str):
                normalized[key] = _coerce_numeric(value, default=0)
            else:
                normalized[key] = value
            continue

        if key in _NUMERIC_DEFAULTS and isinstance(value, str):
            normalized[key] = _coerce_numeric(value, default=_default_for_numeric(key))
            continue

        if isinstance(value, dict):
            normalized[key] = normalize_import_draft_payload(value)
            continue

        if isinstance(value, list):
            normalized[key] = normalize_import_draft_payload(value)
            continue

        normalized[key] = value

    return normalized
