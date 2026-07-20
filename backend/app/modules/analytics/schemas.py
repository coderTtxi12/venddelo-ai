from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AnalyticsGranularity = Literal["daily", "weekly", "monthly"]
AnalyticsPreset = Literal["7d", "4w", "12m", "custom"]


class AnalyticsPeriod(BaseModel):
    preset: AnalyticsPreset
    granularity: AnalyticsGranularity
    timezone: str
    start: datetime
    end: datetime
    comparison_start: datetime
    comparison_end: datetime
    label: str


class AnalyticsSummary(BaseModel):
    total_revenue_cents: int = 0
    order_count: int = 0
    avg_order_cents: int = 0
    total_discount_cents: int = 0
    cancelled_count: int = 0
    cancellation_rate_pct: float = 0.0
    pending_orders: int = 0
    revenue_change_pct: float | None = None
    order_count_change_pct: float | None = None
    avg_order_change_pct: float | None = None


class AnalyticsSalesPoint(BaseModel):
    bucket_start: datetime
    label: str
    revenue_cents: int = 0
    order_count: int = 0


class AnalyticsTopProduct(BaseModel):
    product_id: str | None = None
    product_name: str
    quantity: int = 0
    revenue_cents: int = 0


class AnalyticsTopCustomer(BaseModel):
    customer_name: str
    customer_phone: str
    order_count: int = 0
    total_spent_cents: int = 0


class AnalyticsPromotionUsage(BaseModel):
    promotion_id: str | None = None
    promotion_name: str
    usage_count: int = 0
    discount_cents: int = 0
    effective_status: str | None = None


class AnalyticsOrderTypeBreakdown(BaseModel):
    order_type: str
    count: int = 0
    revenue_cents: int = 0


class AnalyticsPaymentMethodBreakdown(BaseModel):
    payment_method: str
    count: int = 0
    revenue_cents: int = 0


class AnalyticsCustomerStats(BaseModel):
    unique_customers: int = 0
    repeat_customers: int = 0
    repeat_customer_pct: float = 0.0
    new_customers: int = 0


class AnalyticsDashboard(BaseModel):
    period: AnalyticsPeriod
    summary: AnalyticsSummary
    sales_series: list[AnalyticsSalesPoint] = Field(default_factory=list)
    top_products: list[AnalyticsTopProduct] = Field(default_factory=list)
    top_customers: list[AnalyticsTopCustomer] = Field(default_factory=list)
    promotion_usage: list[AnalyticsPromotionUsage] = Field(default_factory=list)
    order_types: list[AnalyticsOrderTypeBreakdown] = Field(default_factory=list)
    payment_methods: list[AnalyticsPaymentMethodBreakdown] = Field(default_factory=list)
    customer_stats: AnalyticsCustomerStats = Field(default_factory=AnalyticsCustomerStats)
