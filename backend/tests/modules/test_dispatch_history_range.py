from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.core.exceptions import ValidationError
from app.modules.delivery_dispatch.history import (
    _delivered_rider_card_fields,
    _normalize_ids,
    _reject_include_and_exclude,
    mexico_city_range,
    normalize_history_query,
)
from app.modules.delivery_dispatch.schemas import dispatch_request_source


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


def test_reject_include_and_exclude_same_entity() -> None:
    try:
        _reject_include_and_exclude([uuid4()], [uuid4()], "negocio")
    except ValidationError as exc:
        assert "negocio" in exc.message
    else:
        raise AssertionError("expected ValidationError")


def test_normalize_ids_dedupes_and_accepts_single() -> None:
    one = uuid4()
    two = uuid4()
    assert _normalize_ids(one) == [one]
    assert _normalize_ids([one, two, one]) == [one, two]
    assert _normalize_ids(None) == []


def test_reject_include_and_exclude_allows_one_side() -> None:
    _reject_include_and_exclude([uuid4()], [], "negocio")
    _reject_include_and_exclude([], [uuid4()], "repartidor")


def test_normalize_history_query_strips_hash_spaces_and_punctuation() -> None:
    assert normalize_history_query("#BDE4E") == "BDE4E"
    assert normalize_history_query("  bde4e  ") == "BDE4E"
    assert normalize_history_query("##bd-e4") == "BDE4"
    assert normalize_history_query(None) == ""
    assert normalize_history_query("#") == ""


def test_dispatch_request_source_uses_linked_order() -> None:
    assert dispatch_request_source(uuid4()) == "web_app"
    assert dispatch_request_source(None) == "manual"
