from datetime import UTC, datetime

import pytest
from zoneinfo import ZoneInfo

from app.core.exceptions import ValidationError
from app.modules.analytics.service import resolve_analytics_period


NOW = datetime(2026, 3, 18, 15, 0, tzinfo=UTC)
TZ = "America/Mexico_City"


def test_preset_7d_label_and_bounds():
    resolved = resolve_analytics_period(preset="7d", timezone=TZ, now=NOW)
    assert resolved.label == "Últimos 7 días"
    assert resolved.chart_granularity == "daily"
    assert resolved.period_end.astimezone(ZoneInfo(TZ)).date().isoformat() == "2026-03-18"


def test_preset_4w_label():
    resolved = resolve_analytics_period(preset="4w", timezone=TZ, now=NOW)
    assert resolved.label == "Últimas 4 semanas"
    assert resolved.chart_granularity == "weekly"


def test_preset_12m_label():
    resolved = resolve_analytics_period(preset="12m", timezone=TZ, now=NOW)
    assert resolved.label == "Últimos 12 meses"
    assert resolved.chart_granularity == "monthly"


def test_custom_range_label_and_comparison_same_duration():
    resolved = resolve_analytics_period(
        preset="custom",
        timezone=TZ,
        start_date="2026-03-03",
        end_date="2026-03-18",
        now=NOW,
    )
    assert "3 mar" in resolved.label.lower() or "mar 2026" in resolved.label.lower()
    current_days = (resolved.period_end - resolved.period_start).days
    comparison_days = (resolved.comparison_end - resolved.comparison_start).days
    assert current_days == comparison_days
    assert resolved.chart_granularity == "daily"


def test_custom_chart_granularity_weekly_for_60_days():
    resolved = resolve_analytics_period(
        preset="custom",
        timezone=TZ,
        start_date="2026-01-18",
        end_date="2026-03-18",
        now=NOW,
    )
    assert resolved.chart_granularity == "weekly"


def test_custom_rejects_future_end():
    with pytest.raises(ValidationError, match="futura"):
        resolve_analytics_period(
            preset="custom",
            timezone=TZ,
            start_date="2026-03-01",
            end_date="2026-03-25",
            now=NOW,
        )


def test_custom_rejects_range_over_366_days():
    with pytest.raises(ValidationError, match="366"):
        resolve_analytics_period(
            preset="custom",
            timezone=TZ,
            start_date="2025-01-01",
            end_date="2026-03-18",
            now=NOW,
        )


def test_granularity_compat_maps_to_preset():
    resolved = resolve_analytics_period(
        preset="12m",
        timezone=TZ,
        granularity="daily",
        now=NOW,
    )
    assert resolved.preset == "7d"
    assert resolved.label == "Últimos 7 días"
