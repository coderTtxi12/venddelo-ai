from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from zoneinfo import ZoneInfo

from app.core.exceptions import NotFoundError
from app.modules.analytics.repository import AnalyticsRepository
from app.modules.analytics.schemas import (
    AnalyticsDashboard,
    AnalyticsGranularity,
    AnalyticsPeriod,
    AnalyticsSummary,
)
from app.modules.restaurants.repository import RestaurantRepository


def _pct_change(current: int | float, previous: int | float) -> float | None:
    if previous == 0:
        if current == 0:
            return 0.0
        return 100.0
    return round(((current - previous) / previous) * 100, 1)


def _period_bounds(
    granularity: AnalyticsGranularity,
    *,
    timezone: str,
    now: datetime | None = None,
) -> tuple[datetime, datetime, datetime, datetime, str]:
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)

    tz = ZoneInfo(timezone)
    local_now = current.astimezone(tz)

    if granularity == "daily":
        local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        local_start = (local_end - timedelta(days=6)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        comparison_end = local_start - timedelta(microseconds=1)
        comparison_start = (comparison_end - timedelta(days=6)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        label = "Últimos 7 días"
    elif granularity == "weekly":
        local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        local_start = (local_end - timedelta(weeks=3)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        comparison_end = local_start - timedelta(microseconds=1)
        comparison_start = (comparison_end - timedelta(weeks=3)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        label = "Últimas 4 semanas"
    else:
        local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        local_start = local_end.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ) - timedelta(days=0)
        # Go back 11 months from start of current month
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
        label = "Últimos 12 meses"

    return (
        local_start.astimezone(UTC),
        local_end.astimezone(UTC),
        comparison_start.astimezone(UTC),
        comparison_end.astimezone(UTC),
        label,
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
        granularity: AnalyticsGranularity = "monthly",
    ) -> AnalyticsDashboard:
        restaurant = self._restaurants.get(restaurant_id)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")

        timezone = restaurant.timezone or "America/Mexico_City"
        period_start, period_end, comparison_start, comparison_end, label = _period_bounds(
            granularity,
            timezone=timezone,
        )

        summary = self._analytics.get_summary(
            restaurant_id,
            period_start=period_start,
            period_end=period_end,
        )
        comparison = self._analytics.get_summary(
            restaurant_id,
            period_start=comparison_start,
            period_end=comparison_end,
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
                granularity=granularity,
                timezone=timezone,
                start=period_start,
                end=period_end,
                comparison_start=comparison_start,
                comparison_end=comparison_end,
                label=label,
            ),
            summary=summary,
            sales_series=self._analytics.get_sales_series(
                restaurant_id,
                timezone=timezone,
                granularity=granularity,
                period_start=period_start,
                period_end=period_end,
            ),
            top_products=self._analytics.get_top_products(
                restaurant_id,
                period_start=period_start,
                period_end=period_end,
            ),
            top_customers=self._analytics.get_top_customers(
                restaurant_id,
                period_start=period_start,
                period_end=period_end,
            ),
            promotion_usage=self._analytics.get_promotion_usage(
                restaurant_id,
                period_start=period_start,
                period_end=period_end,
            ),
            order_types=self._analytics.get_order_type_breakdown(
                restaurant_id,
                period_start=period_start,
                period_end=period_end,
            ),
            payment_methods=self._analytics.get_payment_method_breakdown(
                restaurant_id,
                period_start=period_start,
                period_end=period_end,
            ),
            customer_stats=self._analytics.get_customer_stats(
                restaurant_id,
                period_start=period_start,
                period_end=period_end,
            ),
        )
