from __future__ import annotations

from datetime import date
from typing import Literal

CouponEffectiveStatus = Literal["inactive", "expired", "sold_out", "active"]


def remaining_qty(stock_qty: int | None, redemption_count: int) -> int | None:
    if stock_qty is None:
        return None
    return max(0, stock_qty - redemption_count)


def coupon_effective_status(
    is_active: bool,
    expires_on: date | None,
    stock_qty: int | None,
    redemption_count: int,
    today: date,
) -> CouponEffectiveStatus:
    if not is_active:
        return "inactive"
    if expires_on is not None and today > expires_on:
        return "expired"
    if stock_qty is not None and remaining_qty(stock_qty, redemption_count) == 0:
        return "sold_out"
    return "active"
