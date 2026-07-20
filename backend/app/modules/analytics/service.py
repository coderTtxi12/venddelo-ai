from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from zoneinfo import ZoneInfo

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.analytics.repository import AnalyticsRepository
from app.modules.analytics.schemas import (
    AnalyticsDashboard,
    AnalyticsGranularity,
    AnalyticsPeriod,
    AnalyticsPreset,
    AnalyticsSummary,
)
from app.modules.restaurants.repository import RestaurantRepository

_MONTH_ES = (
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
)

_GRANULARITY_TO_PRESET: dict[AnalyticsGranularity, AnalyticsPreset] = {
    "daily": "7d",
    "weekly": "4w",
    "monthly": "12m",
}


@dataclass(frozen=True)
class ResolvedAnalyticsPeriod:
    preset: AnalyticsPreset
    period_start: datetime
    period_end: datetime
    comparison_start: datetime
    comparison_end: datetime
    label: str
    chart_granularity: AnalyticsGranularity


def _pct_change(current: int | float, previous: int | float) -> float | None:
    if previous == 0:
        if current == 0:
            return 0.0
        return 100.0
    return round(((current - previous) / previous) * 100, 1)


def _normalize_now(now: datetime | None) -> datetime:
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        return current.replace(tzinfo=UTC)
    return current


def _custom_chart_granularity(inclusive_days: int) -> AnalyticsGranularity:
    if inclusive_days <= 31:
        return "daily"
    if inclusive_days <= 90:
        return "weekly"
    return "monthly"


def _format_custom_label(local_start: datetime, local_end: datetime) -> str:
    start_text = f"{local_start.day} {_MONTH_ES[local_start.month - 1]} {local_start.year}"
    end_text = f"{local_end.day} {_MONTH_ES[local_end.month - 1]} {local_end.year}"
    return f"{start_text} – {end_text}"


def _parse_local_date(value: str, tz: ZoneInfo) -> datetime:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError("Formato de fecha inválido. Usa YYYY-MM-DD.") from exc
    return datetime(parsed.year, parsed.month, parsed.day, tzinfo=tz)


def _preset_bounds(
    preset: AnalyticsPreset,
    *,
    timezone: str,
    now: datetime,
) -> tuple[datetime, datetime, datetime, datetime, str, AnalyticsGranularity]:
    tz = ZoneInfo(timezone)
    local_now = now.astimezone(tz)

    if preset == "7d":
        local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        local_start = (local_end - timedelta(days=6)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        comparison_end = local_start - timedelta(microseconds=1)
        comparison_start = (comparison_end - timedelta(days=6)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return (
            local_start.astimezone(UTC),
            local_end.astimezone(UTC),
            comparison_start.astimezone(UTC),
            comparison_end.astimezone(UTC),
            "Últimos 7 días",
            "daily",
        )

    if preset == "4w":
        local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        local_start = (local_end - timedelta(weeks=3)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        comparison_end = local_start - timedelta(microseconds=1)
        comparison_start = (comparison_end - timedelta(weeks=3)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return (
            local_start.astimezone(UTC),
            local_end.astimezone(UTC),
            comparison_start.astimezone(UTC),
            comparison_end.astimezone(UTC),
            "Últimas 4 semanas",
            "weekly",
        )

    local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
    local_start = local_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month = local_start.month - 11
    year = local_start.year
    while month <= 0:
        month += 12
        year -= 1
    local_start = local_start.replace(year=year, month=month, day=1)
    comparison_end = local_start - timedelta(microseconds=1)
    comp_month = local_start.month - 12
    comp_year = local_start.year
    while comp_month <= 0:
        comp_month += 12
        comp_year -= 1
    comparison_start = local_start.replace(year=comp_year, month=comp_month, day=1)
    return (
        local_start.astimezone(UTC),
        local_end.astimezone(UTC),
        comparison_start.astimezone(UTC),
        comparison_end.astimezone(UTC),
        "Últimos 12 meses",
        "monthly",
    )


def _custom_bounds(
    *,
    timezone: str,
    start_date: str,
    end_date: str,
    now: datetime,
) -> tuple[datetime, datetime, datetime, datetime, str, AnalyticsGranularity]:
    tz = ZoneInfo(timezone)
    local_now = now.astimezone(tz)
    local_start = _parse_local_date(start_date, tz).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    local_end = _parse_local_date(end_date, tz).replace(
        hour=23, minute=59, second=59, microsecond=999999
    )

    if local_start > local_end:
        raise ValidationError("La fecha inicial debe ser anterior o igual a la fecha final.")

    if local_end.date() > local_now.date():
        raise ValidationError("La fecha final no puede ser futura.")

    inclusive_days = (local_end.date() - local_start.date()).days + 1
    if inclusive_days > 366:
        raise ValidationError("El rango personalizado no puede superar 366 días.")

    comparison_end = local_start - timedelta(microseconds=1)
    comparison_start = (local_start - timedelta(days=inclusive_days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    return (
        local_start.astimezone(UTC),
        local_end.astimezone(UTC),
        comparison_start.astimezone(UTC),
        comparison_end.astimezone(UTC),
        _format_custom_label(local_start, local_end),
        _custom_chart_granularity(inclusive_days),
    )


def resolve_analytics_period(
    *,
    preset: AnalyticsPreset = "12m",
    timezone: str,
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: AnalyticsGranularity | None = None,
    now: datetime | None = None,
) -> ResolvedAnalyticsPeriod:
    current = _normalize_now(now)
    effective_preset = preset
    if granularity is not None:
        effective_preset = _GRANULARITY_TO_PRESET[granularity]

    if effective_preset == "custom":
        if not start_date or not end_date:
            raise ValidationError(
                "Debes indicar fecha inicial y final para un periodo personalizado."
            )
        (
            period_start,
            period_end,
            comparison_start,
            comparison_end,
            label,
            chart_granularity,
        ) = _custom_bounds(
            timezone=timezone,
            start_date=start_date,
            end_date=end_date,
            now=current,
        )
    else:
        (
            period_start,
            period_end,
            comparison_start,
            comparison_end,
            label,
            chart_granularity,
        ) = _preset_bounds(effective_preset, timezone=timezone, now=current)

    return ResolvedAnalyticsPeriod(
        preset=effective_preset,
        period_start=period_start,
        period_end=period_end,
        comparison_start=comparison_start,
        comparison_end=comparison_end,
        label=label,
        chart_granularity=chart_granularity,
    )


class AnalyticsService:
    def __init__(
        self,
        analytics: AnalyticsRepository,
        restaurants: RestaurantRepository,
    ) -> None:
        self._analytics = analytics
        self._restaurants = restaurants

    def get_dashboard(
        self,
        restaurant_id: uuid.UUID,
        *,
        preset: AnalyticsPreset = "12m",
        start_date: str | None = None,
        end_date: str | None = None,
        granularity: AnalyticsGranularity | None = None,
    ) -> AnalyticsDashboard:
        restaurant = self._restaurants.get(restaurant_id)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")

        timezone = restaurant.timezone or "America/Mexico_City"
        resolved = resolve_analytics_period(
            preset=preset,
            timezone=timezone,
            start_date=start_date,
            end_date=end_date,
            granularity=granularity,
        )

        summary = self._analytics.get_summary(
            restaurant_id,
            period_start=resolved.period_start,
            period_end=resolved.period_end,
        )
        comparison = self._analytics.get_summary(
            restaurant_id,
            period_start=resolved.comparison_start,
            period_end=resolved.comparison_end,
        )
        summary.revenue_change_pct = _pct_change(
            summary.total_revenue_cents,
            comparison.total_revenue_cents,
        )
        summary.order_count_change_pct = _pct_change(
            summary.order_count,
            comparison.order_count,
        )
        summary.avg_order_change_pct = _pct_change(
            summary.avg_order_cents,
            comparison.avg_order_cents,
        )

        return AnalyticsDashboard(
            period=AnalyticsPeriod(
                preset=resolved.preset,
                granularity=resolved.chart_granularity,
                timezone=timezone,
                start=resolved.period_start,
                end=resolved.period_end,
                comparison_start=resolved.comparison_start,
                comparison_end=resolved.comparison_end,
                label=resolved.label,
            ),
            summary=summary,
            sales_series=self._analytics.get_sales_series(
                restaurant_id,
                timezone=timezone,
                granularity=resolved.chart_granularity,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
            top_products=self._analytics.get_top_products(
                restaurant_id,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
            top_customers=self._analytics.get_top_customers(
                restaurant_id,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
            promotion_usage=self._analytics.get_promotion_usage(
                restaurant_id,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
            order_types=self._analytics.get_order_type_breakdown(
                restaurant_id,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
            payment_methods=self._analytics.get_payment_method_breakdown(
                restaurant_id,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
            customer_stats=self._analytics.get_customer_stats(
                restaurant_id,
                period_start=resolved.period_start,
                period_end=resolved.period_end,
            ),
        )
