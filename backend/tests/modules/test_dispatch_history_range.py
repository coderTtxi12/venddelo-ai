from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.core.exceptions import ValidationError
from app.modules.delivery_dispatch.history import mexico_city_range


def test_mexico_city_range_is_inclusive_dates_exclusive_end_utc() -> None:
    start_utc, end_utc = mexico_city_range(date(2026, 8, 18), date(2026, 8, 18))
    mexico = ZoneInfo("America/Mexico_City")
    expected_start = datetime(2026, 8, 18, tzinfo=mexico).astimezone(UTC)
    expected_end = datetime(2026, 8, 19, tzinfo=mexico).astimezone(UTC)
    assert start_utc == expected_start
    assert end_utc == expected_end


def test_mexico_city_range_rejects_end_before_start() -> None:
    try:
        mexico_city_range(date(2026, 8, 19), date(2026, 8, 18))
    except ValidationError as exc:
        assert "fecha" in exc.message.lower()
    else:
        raise AssertionError("expected ValidationError")
