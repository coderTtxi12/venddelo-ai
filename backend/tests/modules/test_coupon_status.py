from datetime import date

from app.modules.coupons.status import coupon_effective_status, remaining_qty


def test_status_priority():
    today = date(2026, 9, 1)
    assert coupon_effective_status(False, None, None, 0, today) == "inactive"
    assert coupon_effective_status(True, date(2026, 8, 31), None, 0, today) == "expired"
    assert coupon_effective_status(True, None, 10, 10, today) == "sold_out"
    assert coupon_effective_status(True, date(2026, 9, 1), 10, 3, today) == "active"


def test_remaining_qty():
    assert remaining_qty(None, 9) is None
    assert remaining_qty(10, 3) == 7
    assert remaining_qty(10, 12) == 0
