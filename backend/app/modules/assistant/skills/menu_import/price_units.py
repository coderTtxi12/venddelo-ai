"""Menu import prices are transcribed in MXN pesos; the live menu stores cents."""

from __future__ import annotations

from typing import Any


def mxn_to_cents(mxn: float) -> int:
    return int(round(mxn * 100))


def _coerce_legacy_cents_field(
    data: dict[str, Any],
    *,
    mxn_key: str,
    cents_key: str,
    null_default: float | None = None,
) -> dict[str, Any]:
    normalized = dict(data)
    if mxn_key in normalized and normalized[mxn_key] is None:
        if null_default is not None:
            normalized[mxn_key] = null_default
        else:
            normalized.pop(mxn_key)
    if mxn_key in normalized:
        return normalized
    if cents_key not in normalized:
        return normalized
    normalized[mxn_key] = float(normalized.pop(cents_key)) / 100
    return normalized
