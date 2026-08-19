from types import SimpleNamespace

from sqlalchemy.exc import IntegrityError

from app.modules.delivery_dispatch.tasks import _is_live_offer_conflict


def test_live_offer_conflict_detects_partial_unique_constraints():
    for name in (
        "uq_delivery_dispatch_offers_one_offered_per_driver",
        "uq_delivery_dispatch_offers_one_offered_per_request",
    ):
        orig = SimpleNamespace(diag=SimpleNamespace(constraint_name=name))
        assert _is_live_offer_conflict(IntegrityError("INSERT", {}, orig))


def test_live_offer_conflict_ignores_other_integrity_errors():
    orig = SimpleNamespace(
        diag=SimpleNamespace(constraint_name="delivery_credit_holds_request_id_key")
    )
    assert not _is_live_offer_conflict(IntegrityError("INSERT", {}, orig))
