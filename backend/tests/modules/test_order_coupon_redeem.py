from app.modules.orders.coupons import should_redeem_coupon_on_transition


def test_redeem_only_on_confirm():
    assert should_redeem_coupon_on_transition("pending", "confirmed") is True
    assert should_redeem_coupon_on_transition("pending", "cancelled") is False
    assert should_redeem_coupon_on_transition("confirmed", "preparing") is False
