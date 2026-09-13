from datetime import UTC, datetime

from app.modules.delivery_dispatch.credit import (
    credit_required_cents,
    hold_of_kind,
    mark_holds_released,
)


def test_credit_required_is_zero_without_cash_or_mexy():
    assert (
        credit_required_cents(payment_method="transfer", collect_cents=0, mexy_fee_cents=0)
        == 0
    )


def test_credit_required_cash_only():
    assert (
        credit_required_cents(
            payment_method="cash", collect_cents=25000, mexy_fee_cents=0
        )
        == 25000
    )


def test_credit_required_mexy_fee_on_any_payment_method():
    assert (
        credit_required_cents(
            payment_method="transfer", collect_cents=0, mexy_fee_cents=3500
        )
        == 3500
    )
    assert (
        credit_required_cents(
            payment_method="cash", collect_cents=25000, mexy_fee_cents=3500
        )
        == 28500
    )


def test_hold_of_kind_picks_matching_row():
    cash = type("Hold", (), {"kind": "restaurant_cash", "amount_cents": 25000})()
    mexy = type("Hold", (), {"kind": "mexy_fee", "amount_cents": 3500})()
    assert hold_of_kind([cash, mexy], "mexy_fee") is mexy
    assert hold_of_kind([cash, mexy], "restaurant_cash") is cash
    assert hold_of_kind([cash], "mexy_fee") is None


def _hold(*, kind: str, status: str = "held", amount_cents: int = 3500):
    return type(
        "Hold",
        (),
        {
            "kind": kind,
            "status": status,
            "amount_cents": amount_cents,
            "released_at": None,
            "released_by_user_id": None,
        },
    )()


def test_mark_holds_released_can_target_mexy_fee_only():
    cash = _hold(kind="restaurant_cash", amount_cents=25000)
    mexy = _hold(kind="mexy_fee", amount_cents=3500)
    now = datetime(2026, 9, 13, tzinfo=UTC)
    released = mark_holds_released(
        [cash, mexy],
        kind="mexy_fee",
        now=now,
        released_by_user_id="user-1",
    )
    assert released == [mexy]
    assert mexy.status == "released"
    assert mexy.released_at is now
    assert mexy.released_by_user_id == "user-1"
    assert cash.status == "held"
