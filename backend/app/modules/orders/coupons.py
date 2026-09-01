from __future__ import annotations


def should_redeem_coupon_on_transition(previous_status: str, next_status: str) -> bool:
    return previous_status == "pending" and next_status == "confirmed"
