from app.modules.delivery_dispatch.credit import credit_required_cents, hold_of_kind


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
