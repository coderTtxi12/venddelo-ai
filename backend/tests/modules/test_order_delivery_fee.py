from app.modules.orders.delivery_fee import (
    customer_payable_delivery_cents,
    provider_quoted_fee_cents,
    resolve_delivery_waiver_cents,
)


def test_customer_payable_zero_when_fully_waived():
    assert customer_payable_delivery_cents(4500, 4500) == 0


def test_customer_payable_full_when_no_waiver():
    assert customer_payable_delivery_cents(4500, 0) == 4500


def test_resolve_waiver_prefers_coupon_then_promo_flag():
    assert (
        resolve_delivery_waiver_cents(
            delivery_fee_cents=4500,
            coupon_waived_delivery_cents=4500,
            promo_free_shipping=True,
        )
        == 4500
    )
    assert (
        resolve_delivery_waiver_cents(
            delivery_fee_cents=4500,
            coupon_waived_delivery_cents=0,
            promo_free_shipping=True,
        )
        == 4500
    )
    assert (
        resolve_delivery_waiver_cents(
            delivery_fee_cents=4500,
            coupon_waived_delivery_cents=0,
            promo_free_shipping=False,
        )
        == 0
    )


def test_provider_quoted_fee_historical_fallback():
    assert provider_quoted_fee_cents(0, 4500) == 4500
    assert provider_quoted_fee_cents(4500, 4500) == 4500
    assert provider_quoted_fee_cents(0, 0) == 0
