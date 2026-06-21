from __future__ import annotations

import uuid
from datetime import UTC, datetime, time

from app.modules.promotions.effective import effective_status, is_promotion_effective, resolve_timezone
from app.modules.promotions.schemas import PromotionDTO


def _promo(**overrides) -> PromotionDTO:
    base = {
        "id": uuid.uuid4(),
        "restaurant_id": uuid.uuid4(),
        "name": "Test",
        "type": "two_for_one",
        "scope": "category",
        "percent": None,
        "amount_cents": None,
        "min_order_cents": None,
        "starts_at": None,
        "ends_at": None,
        "bundle_get_quantity": 2,
        "bundle_pay_quantity": 1,
        "recurrence_weekdays": None,
        "recurrence_start_time": None,
        "recurrence_end_time": None,
        "is_active": True,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "product_ids": [],
        "category_ids": [],
        "option_item_ids": [],
    }
    base.update(overrides)
    return PromotionDTO(**base)


def test_resolve_timezone_defaults_to_cdmx():
    tz = resolve_timezone(None)
    assert str(tz) == "America/Mexico_City"


def test_weekday_filter_wednesday_only():
    tz = resolve_timezone("America/Mexico_City")
    wednesday = datetime(2026, 6, 17, 19, 0, tzinfo=UTC)  # 14:00 CDMX Wed
    promo = _promo(recurrence_weekdays=[2])  # Wednesday
    assert is_promotion_effective(promo, wednesday, tz)

    thursday = datetime(2026, 6, 18, 19, 0, tzinfo=UTC)
    assert not is_promotion_effective(promo, thursday, tz)


def test_time_window():
    tz = resolve_timezone("America/Mexico_City")
    promo = _promo(
        recurrence_weekdays=[2],
        recurrence_start_time=time(12, 0),
        recurrence_end_time=time(22, 0),
    )
    inside = datetime(2026, 6, 17, 19, 0, tzinfo=UTC)  # 14:00 CDMX Wed
    outside = datetime(2026, 6, 17, 5, 0, tzinfo=UTC)  # 00:00 CDMX Wed
    assert is_promotion_effective(promo, inside, tz)
    assert not is_promotion_effective(promo, outside, tz)


def test_effective_status_outside_schedule():
    tz = resolve_timezone("America/Mexico_City")
    promo = _promo(recurrence_weekdays=[2])
    thursday = datetime(2026, 6, 18, 19, 0, tzinfo=UTC)
    assert effective_status(promo, thursday, tz) == "outside_schedule"


def test_inactive_promotion():
    tz = resolve_timezone("America/Mexico_City")
    promo = _promo(is_active=False)
    now = datetime(2026, 6, 18, 19, 0, tzinfo=UTC)
    assert not is_promotion_effective(promo, now, tz)
    assert effective_status(promo, now, tz) == "inactive"
