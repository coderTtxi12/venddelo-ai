from datetime import UTC, date, datetime
from uuid import uuid4

from app.core.exceptions import ValidationError
from app.modules.delivery_dispatch.occupancy import (
    BusyInterval,
    normalize_customer_phone,
    peak_occupancy,
    require_same_length,
    routed_request_ids,
    stacked_driver_ids,
)


def test_normalize_customer_phone_keeps_digits() -> None:
    assert normalize_customer_phone("+52 55 1111-2222") == "525511112222"
    assert normalize_customer_phone("  ") == ""


def test_require_same_length_rejects_mismatched_spans() -> None:
    try:
        require_same_length(
            date(2026, 9, 9),
            date(2026, 9, 9),
            date(2026, 9, 1),
            date(2026, 9, 7),
        )
    except ValidationError as exc:
        assert "mismo" in exc.message.lower() or "durar" in exc.message.lower()
    else:
        raise AssertionError("expected ValidationError")


def test_require_same_length_accepts_equal_day_count() -> None:
    assert require_same_length(
        date(2026, 9, 7),
        date(2026, 9, 13),
        date(2026, 8, 24),
        date(2026, 8, 30),
    ) == (date(2026, 8, 24), date(2026, 8, 30))


def test_peak_occupancy_is_distinct_busy_drivers() -> None:
    d1, d2 = uuid4(), uuid4()
    r1, r2, r3 = uuid4(), uuid4(), uuid4()
    t0 = datetime(2026, 9, 9, 12, 0, tzinfo=UTC)
    t1 = datetime(2026, 9, 9, 12, 30, tzinfo=UTC)
    t2 = datetime(2026, 9, 9, 13, 0, tzinfo=UTC)
    t3 = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)
    intervals = [
        BusyInterval(driver_id=d1, request_id=r1, start=t0, end=t2, grouped=False),
        BusyInterval(driver_id=d2, request_id=r2, start=t1, end=t3, grouped=False),
        BusyInterval(driver_id=d1, request_id=r3, start=t2, end=t3, grouped=False),
    ]
    assert peak_occupancy(intervals, t0, t3) == 2


def test_routed_orders_are_same_driver_overlaps_or_group() -> None:
    d1, d2 = uuid4(), uuid4()
    r1, r2, r3, r4 = uuid4(), uuid4(), uuid4(), uuid4()
    t0 = datetime(2026, 9, 9, 12, 0, tzinfo=UTC)
    t1 = datetime(2026, 9, 9, 12, 20, tzinfo=UTC)
    t2 = datetime(2026, 9, 9, 13, 0, tzinfo=UTC)
    t3 = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)
    intervals = [
        BusyInterval(driver_id=d1, request_id=r1, start=t0, end=t2, grouped=False),
        BusyInterval(driver_id=d1, request_id=r2, start=t1, end=t3, grouped=False),
        BusyInterval(driver_id=d2, request_id=r3, start=t0, end=t3, grouped=False),
        BusyInterval(driver_id=d2, request_id=r4, start=t3, end=t3, grouped=True),
    ]
    routed = routed_request_ids(intervals, t0, t3)
    assert r1 in routed and r2 in routed
    assert r3 not in routed
    assert r4 in routed
    assert stacked_driver_ids(intervals, t0, t3) == {d1}
