from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

_ZERO = Decimal("0")
_SIX_PLACES = Decimal("0.000001")

_PRICE_PER_1K: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4o-mini": (Decimal("0.000150"), Decimal("0.000600")),
}


def compute_llm_cost_usd(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    normalized = model.strip().lower()
    if normalized == "stub":
        return _ZERO
    prices = _PRICE_PER_1K.get(normalized)
    if prices is None:
        return _ZERO
    input_price, output_price = prices
    cost = (
        Decimal(input_tokens) * input_price / Decimal(1000)
        + Decimal(output_tokens) * output_price / Decimal(1000)
    )
    return cost.quantize(_SIX_PLACES, rounding=ROUND_HALF_UP)
