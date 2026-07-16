from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime

from app.modules.analytics.schemas import (
    AnalyticsCustomerStats,
    AnalyticsDashboard,
    AnalyticsGranularity,
    AnalyticsOrderTypeBreakdown,
    AnalyticsPaymentMethodBreakdown,
    AnalyticsPromotionUsage,
    AnalyticsSalesPoint,
    AnalyticsSummary,
    AnalyticsTopCustomer,
    AnalyticsTopProduct,
)


class AnalyticsRepository(ABC):
    @abstractmethod
    def get_dashboard(
        self,
        restaurant_id: uuid.UUID,
        *,
        timezone: str,
        granularity: AnalyticsGranularity,
        period_start: datetime,
        period_end: datetime,
        comparison_start: datetime,
        comparison_end: datetime,
    ) -> AnalyticsDashboard: ...

    @abstractmethod
    def get_summary(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> AnalyticsSummary: ...

    @abstractmethod
    def get_sales_series(
        self,
        restaurant_id: uuid.UUID,
        *,
        timezone: str,
        granularity: AnalyticsGranularity,
        period_start: datetime,
        period_end: datetime,
    ) -> list[AnalyticsSalesPoint]: ...

    @abstractmethod
    def get_top_products(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
        limit: int = 5,
    ) -> list[AnalyticsTopProduct]: ...

    @abstractmethod
    def get_top_customers(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
        limit: int = 5,
    ) -> list[AnalyticsTopCustomer]: ...

    @abstractmethod
    def get_promotion_usage(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
        limit: int = 5,
    ) -> list[AnalyticsPromotionUsage]: ...

    @abstractmethod
    def get_order_type_breakdown(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> list[AnalyticsOrderTypeBreakdown]: ...

    @abstractmethod
    def get_payment_method_breakdown(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> list[AnalyticsPaymentMethodBreakdown]: ...

    @abstractmethod
    def get_customer_stats(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> AnalyticsCustomerStats: ...
