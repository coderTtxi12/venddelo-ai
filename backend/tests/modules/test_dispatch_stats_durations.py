from app.modules.delivery_dispatch.stats import (
    _duration_change_pcts,
    _empty_durations,
    _round_avg_seconds,
)


def test_round_avg_seconds_none_and_int():
    assert _round_avg_seconds(None) is None
    assert _round_avg_seconds(90.4) == 90
    assert _round_avg_seconds(90.6) == 91


def test_empty_durations_are_all_none():
    empty = _empty_durations()
    assert empty == {
        "avg_total_seconds": None,
        "avg_search_seconds": None,
        "avg_delivery_seconds": None,
        "avg_pickup_seconds": None,
        "avg_dropoff_seconds": None,
    }


def test_duration_change_pct_none_if_either_sample_missing():
    current = {**_empty_durations(), "avg_total_seconds": 120}
    previous = _empty_durations()
    pcts = _duration_change_pcts(current, previous)
    assert pcts["avg_total_seconds_change_pct"] is None


def test_duration_change_pct_uses_stats_pct_change():
    current = {**_empty_durations(), "avg_total_seconds": 120}
    previous = {**_empty_durations(), "avg_total_seconds": 100}
    pcts = _duration_change_pcts(current, previous)
    assert pcts["avg_total_seconds_change_pct"] == 20.0
