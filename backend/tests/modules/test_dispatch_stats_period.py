from datetime import date

from app.modules.delivery_dispatch.stats import (
    comparison_date_range,
    stats_granularity,
    stats_pct_change,
)


def test_comparison_date_range_equal_span_for_a_day() -> None:
    assert comparison_date_range(date(2026, 9, 9), date(2026, 9, 9)) == (
        date(2026, 9, 8),
        date(2026, 9, 8),
    )


def test_comparison_date_range_previous_week_before_monday_sunday() -> None:
    assert comparison_date_range(date(2026, 9, 7), date(2026, 9, 13)) == (
        date(2026, 8, 31),
        date(2026, 9, 6),
    )


def test_comparison_date_range_previous_calendar_month() -> None:
    assert comparison_date_range(date(2026, 9, 1), date(2026, 9, 30)) == (
        date(2026, 8, 1),
        date(2026, 8, 31),
    )


def test_stats_granularity_buckets() -> None:
    assert stats_granularity(date(2026, 9, 9), date(2026, 9, 9)) == "hourly"
    assert stats_granularity(date(2026, 9, 7), date(2026, 9, 13)) == "daily"
    assert stats_granularity(date(2026, 8, 1), date(2026, 9, 30)) == "weekly"


def test_stats_pct_change_handles_zero_baseline() -> None:
    assert stats_pct_change(12, 10) == 20.0
    assert stats_pct_change(0, 0) == 0.0
    assert stats_pct_change(5, 0) == 100.0
