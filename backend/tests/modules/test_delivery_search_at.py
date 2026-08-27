from datetime import datetime, timedelta, timezone

from app.modules.delivery_dispatch.search_at import compute_search_at, prep_minutes_from_times


def test_prep_5_minutes_searches_immediately():
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
    ready = now + timedelta(minutes=5)
    assert compute_search_at(now, ready, search_ahead_minutes=0) == now


def test_prep_10_minutes_searches_five_before_ready():
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
    ready = now + timedelta(minutes=10)
    assert compute_search_at(now, ready, search_ahead_minutes=5) == now + timedelta(minutes=5)


def test_prep_minutes_from_times_rounds_ready_minus_created():
    created = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
    ready = created + timedelta(minutes=15)
    assert prep_minutes_from_times(created, ready) == 15
