from datetime import UTC, date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.core.exceptions import ValidationError
from app.modules.delivery_dispatch.history import (
    _delivered_rider_card_fields,
    mexico_city_range,
)


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


def _rider() -> SimpleNamespace:
    return SimpleNamespace(
        first_name="Ana",
        last_name="Pérez",
        phone="+525511112222",
        plate="ABC123",
        motorcycle_color="rojo",
        compartment_size="normal",
        profile_photo_path="drivers/ana.webp",
    )


def test_delivered_rider_card_fields_include_identity() -> None:
    fields = _delivered_rider_card_fields("delivered", _rider())
    assert fields["assigned_driver_first_name"] == "Ana"
    assert fields["assigned_driver_plate"] == "ABC123"
    assert fields["assigned_driver_phone"] == "+525511112222"


def test_cancelled_rider_card_fields_are_empty() -> None:
    fields = _delivered_rider_card_fields("cancelled", _rider())
    assert fields["assigned_driver_first_name"] is None
    assert fields["assigned_driver_plate"] is None
    assert fields["assigned_driver_phone"] is None
