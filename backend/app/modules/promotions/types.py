from __future__ import annotations

STORAGE_TYPES = frozenset({"percent", "amount", "combo", "two_for_one"})
API_TYPES = frozenset({"percent", "amount", "combo", "bundle", "2x1"})


def normalize_promotion_type(value: str | None) -> str | None:
    if value is None:
        return None
    if value in ("bundle", "2x1"):
        return "two_for_one"
    if value in STORAGE_TYPES:
        return value
    raise ValueError(f"Invalid promotion type: {value}")


def serialize_promotion_type(value: str) -> str:
    if value == "two_for_one":
        return "bundle"
    return value
