from __future__ import annotations

from typing import Iterable, TypeVar

HOLD_RESTAURANT_CASH = "restaurant_cash"
HOLD_MEXY_FEE = "mexy_fee"

HoldT = TypeVar("HoldT")


def credit_required_cents(
    *,
    payment_method: str,
    collect_cents: int,
    mexy_fee_cents: int = 0,
) -> int:
    cash = collect_cents if payment_method == "cash" else 0
    mexy = mexy_fee_cents if mexy_fee_cents > 0 else 0
    return cash + mexy


def hold_of_kind(holds: Iterable[HoldT] | None, kind: str) -> HoldT | None:
    for hold in holds or []:
        if getattr(hold, "kind", None) == kind:
            return hold
    return None
