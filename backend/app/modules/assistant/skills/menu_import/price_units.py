"""Menu import prices are transcribed in MXN pesos; the live menu stores cents."""

from __future__ import annotations

from typing import Any


def mxn_to_cents(mxn: float) -> int:
    return int(round(mxn * 100))


def _coerce_legacy_cents_field(data: dict[str, Any], *, mxn_key: str, cents_key: str) -> dict[str, Any]:
    if mxn_key in data:
        return data
    if cents_key not in data:
        return data
    normalized = dict(data)
    normalized[mxn_key] = float(normalized.pop(cents_key)) / 100
    return normalized
