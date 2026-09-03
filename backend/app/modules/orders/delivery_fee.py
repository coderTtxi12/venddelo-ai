"""Customer vs provider delivery fee helpers for free-shipping absorption."""


def customer_payable_delivery_cents(delivery_fee_cents: int, waived_delivery_cents: int) -> int:
    return max(0, int(delivery_fee_cents) - max(0, int(waived_delivery_cents)))


def resolve_delivery_waiver_cents(
    *,
    delivery_fee_cents: int,
    coupon_waived_delivery_cents: int,
    promo_free_shipping: bool,
) -> int:
    fee = max(0, int(delivery_fee_cents))
    coupon_waived = max(0, int(coupon_waived_delivery_cents))
    if coupon_waived > 0:
        return min(fee, coupon_waived)
    if promo_free_shipping and fee > 0:
        return fee
    return 0


def provider_quoted_fee_cents(delivery_fee_cents: int, waived_delivery_cents: int) -> int:
    """B2B fee for dispatch lock, including historical bug fallback."""
    fee = max(0, int(delivery_fee_cents))
    if fee > 0:
        return fee
    waived = max(0, int(waived_delivery_cents))
    if waived > 0:
        return waived
    return 0
