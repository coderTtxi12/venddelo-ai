from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.orders import Order, OrderItem
from app.db.models.promotions import Promotion
from app.db.models.restaurant import Restaurant
from app.modules.analytics.repository import AnalyticsRepository
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
from app.modules.promotions.effective import effective_status, resolve_timezone
from app.modules.promotions.schemas import PromotionDTO

_PENDING_STATUSES = ("pending", "confirmed", "preparing", "ready")
_WEEKDAY_ES = ("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")
_MONTH_ES = (
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
)


def _format_bucket_label(bucket_start: datetime, granularity: AnalyticsGranularity) -> str:
    local = bucket_start.astimezone(UTC)
    if granularity == "daily":
        return _WEEKDAY_ES[local.weekday()]
    if granularity == "weekly":
        return f"Sem {local.isocalendar().week % 100}"
    return _MONTH_ES[local.month - 1]


def _trunc_unit(granularity: AnalyticsGranularity) -> str:
    if granularity == "daily":
        return "day"
    if granularity == "weekly":
        return "week"
    return "month"


class SqlAlchemyAnalyticsRepository(AnalyticsRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def _period_filter(self, stmt, restaurant_id: uuid.UUID, start: datetime, end: datetime):
        return stmt.where(
            Order.restaurant_id == restaurant_id,
            Order.created_at >= start,
            Order.created_at <= end,
        )

    def get_summary(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> AnalyticsSummary:
        delivered_stmt = self._period_filter(
            select(
                func.coalesce(func.sum(Order.total_cents), 0),
                func.count(Order.id),
                func.coalesce(func.sum(Order.discount_cents), 0),
            ),
            restaurant_id,
            period_start,
            period_end,
        ).where(Order.status == "delivered")
        revenue_cents, order_count, discount_cents = self._session.execute(delivered_stmt).one()

        cancelled_stmt = self._period_filter(
            select(func.count(Order.id)),
            restaurant_id,
            period_start,
            period_end,
        ).where(Order.status == "cancelled")
        cancelled_count = self._session.scalar(cancelled_stmt) or 0

        total_stmt = self._period_filter(
            select(func.count(Order.id)),
            restaurant_id,
            period_start,
            period_end,
        )
        total_orders = self._session.scalar(total_stmt) or 0

        pending_stmt = select(func.count(Order.id)).where(
            Order.restaurant_id == restaurant_id,
            Order.status.in_(_PENDING_STATUSES),
        )
        pending_orders = self._session.scalar(pending_stmt) or 0

        order_count = int(order_count or 0)
        revenue_cents = int(revenue_cents or 0)
        discount_cents = int(discount_cents or 0)
        avg_order_cents = int(revenue_cents / order_count) if order_count else 0
        cancellation_rate = (
            round((cancelled_count / total_orders) * 100, 1) if total_orders else 0.0
        )

        return AnalyticsSummary(
            total_revenue_cents=revenue_cents,
            order_count=order_count,
            avg_order_cents=avg_order_cents,
            total_discount_cents=discount_cents,
            cancelled_count=int(cancelled_count),
            cancellation_rate_pct=cancellation_rate,
            pending_orders=int(pending_orders),
        )

    def get_sales_series(
        self,
        restaurant_id: uuid.UUID,
        *,
        timezone: str,
        granularity: AnalyticsGranularity,
        period_start: datetime,
        period_end: datetime,
    ) -> list[AnalyticsSalesPoint]:
        bucket = func.date_trunc(
            _trunc_unit(granularity),
            func.timezone(timezone, Order.created_at),
        )
        stmt = (
            self._period_filter(
                select(
                    bucket.label("bucket_start"),
                    func.coalesce(func.sum(Order.total_cents), 0).label("revenue_cents"),
                    func.count(Order.id).label("order_count"),
                ),
                restaurant_id,
                period_start,
                period_end,
            )
            .where(Order.status == "delivered")
            .group_by(bucket)
            .order_by(bucket)
        )
        rows = self._session.execute(stmt).all()
        return [
            AnalyticsSalesPoint(
                bucket_start=row.bucket_start.replace(tzinfo=UTC)
                if row.bucket_start.tzinfo is None
                else row.bucket_start,
                label=_format_bucket_label(
                    row.bucket_start.replace(tzinfo=UTC)
                    if row.bucket_start.tzinfo is None
                    else row.bucket_start,
                    granularity,
                ),
                revenue_cents=int(row.revenue_cents or 0),
                order_count=int(row.order_count or 0),
            )
            for row in rows
        ]

    def get_top_products(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
        limit: int = 5,
    ) -> list[AnalyticsTopProduct]:
        stmt = (
            select(
                OrderItem.product_id,
                OrderItem.product_name,
                func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity"),
                func.coalesce(func.sum(OrderItem.line_total_cents), 0).label("revenue_cents"),
            )
            .join(Order, OrderItem.order_id == Order.id)
            .where(
                Order.restaurant_id == restaurant_id,
                Order.status == "delivered",
                Order.created_at >= period_start,
                Order.created_at <= period_end,
            )
            .group_by(OrderItem.product_id, OrderItem.product_name)
            .order_by(func.sum(OrderItem.quantity).desc(), func.sum(OrderItem.line_total_cents).desc())
            .limit(limit)
        )
        rows = self._session.execute(stmt).all()
        return [
            AnalyticsTopProduct(
                product_id=str(row.product_id) if row.product_id else None,
                product_name=row.product_name,
                quantity=int(row.quantity or 0),
                revenue_cents=int(row.revenue_cents or 0),
            )
            for row in rows
        ]

    def get_top_customers(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
        limit: int = 5,
    ) -> list[AnalyticsTopCustomer]:
        stmt = (
            self._period_filter(
                select(
                    Order.customer_phone,
                    func.max(Order.customer_name).label("customer_name"),
                    func.count(Order.id).label("order_count"),
                    func.coalesce(func.sum(Order.total_cents), 0).label("total_spent_cents"),
                ),
                restaurant_id,
                period_start,
                period_end,
            )
            .where(Order.status == "delivered")
            .group_by(Order.customer_phone)
            .order_by(func.sum(Order.total_cents).desc(), func.count(Order.id).desc())
            .limit(limit)
        )
        rows = self._session.execute(stmt).all()
        return [
            AnalyticsTopCustomer(
                customer_name=row.customer_name,
                customer_phone=row.customer_phone,
                order_count=int(row.order_count or 0),
                total_spent_cents=int(row.total_spent_cents or 0),
            )
            for row in rows
        ]

    def get_promotion_usage(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
        limit: int = 5,
    ) -> list[AnalyticsPromotionUsage]:
        usage_stmt = (
            select(
                Promotion.id,
                Promotion.name,
                func.count(Order.id).label("usage_count"),
                func.coalesce(func.sum(Order.discount_cents), 0).label("discount_cents"),
            )
            .join(Order, Order.applied_order_promotion_id == Promotion.id)
            .where(
                Promotion.restaurant_id == restaurant_id,
                Order.status == "delivered",
                Order.created_at >= period_start,
                Order.created_at <= period_end,
            )
            .group_by(Promotion.id, Promotion.name)
            .order_by(func.count(Order.id).desc())
            .limit(limit)
        )
        usage_rows = {
            row.id: row for row in self._session.execute(usage_stmt).all()
        }

        promo_stmt = (
            select(Promotion)
            .where(
                Promotion.restaurant_id == restaurant_id,
                Promotion.deleted_at.is_(None),
                Promotion.is_active.is_(True),
            )
            .order_by(Promotion.name)
        )
        promos = list(self._session.scalars(promo_stmt))
        restaurant = self._session.get(Restaurant, restaurant_id)
        tz = resolve_timezone(restaurant.timezone if restaurant else None)
        now = datetime.now(UTC)

        results: list[AnalyticsPromotionUsage] = []
        seen: set[uuid.UUID] = set()
        for promo in promos:
            usage = usage_rows.get(promo.id)
            dto = PromotionDTO.model_validate(promo)
            results.append(
                AnalyticsPromotionUsage(
                    promotion_id=str(promo.id),
                    promotion_name=promo.name,
                    usage_count=int(usage.usage_count) if usage else 0,
                    discount_cents=int(usage.discount_cents) if usage else 0,
                    effective_status=effective_status(dto, now, tz),
                )
            )
            seen.add(promo.id)

        for promo_id, usage in usage_rows.items():
            if promo_id in seen:
                continue
            results.append(
                AnalyticsPromotionUsage(
                    promotion_id=str(promo_id),
                    promotion_name=usage.name,
                    usage_count=int(usage.usage_count or 0),
                    discount_cents=int(usage.discount_cents or 0),
                    effective_status=None,
                )
            )

        results.sort(key=lambda item: (-item.usage_count, item.promotion_name.lower()))
        return results[:limit]

    def get_order_type_breakdown(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> list[AnalyticsOrderTypeBreakdown]:
        stmt = (
            self._period_filter(
                select(
                    Order.type,
                    func.count(Order.id).label("count"),
                    func.coalesce(func.sum(Order.total_cents), 0).label("revenue_cents"),
                ),
                restaurant_id,
                period_start,
                period_end,
            )
            .where(Order.status == "delivered")
            .group_by(Order.type)
            .order_by(func.count(Order.id).desc())
        )
        rows = self._session.execute(stmt).all()
        return [
            AnalyticsOrderTypeBreakdown(
                order_type=row.type,
                count=int(row.count or 0),
                revenue_cents=int(row.revenue_cents or 0),
            )
            for row in rows
        ]

    def get_payment_method_breakdown(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> list[AnalyticsPaymentMethodBreakdown]:
        stmt = (
            self._period_filter(
                select(
                    Order.payment_method,
                    func.count(Order.id).label("count"),
                    func.coalesce(func.sum(Order.total_cents), 0).label("revenue_cents"),
                ),
                restaurant_id,
                period_start,
                period_end,
            )
            .where(Order.status == "delivered")
            .group_by(Order.payment_method)
            .order_by(func.count(Order.id).desc())
        )
        rows = self._session.execute(stmt).all()
        return [
            AnalyticsPaymentMethodBreakdown(
                payment_method=row.payment_method,
                count=int(row.count or 0),
                revenue_cents=int(row.revenue_cents or 0),
            )
            for row in rows
        ]

    def get_customer_stats(
        self,
        restaurant_id: uuid.UUID,
        *,
        period_start: datetime,
        period_end: datetime,
    ) -> AnalyticsCustomerStats:
        phone_counts_stmt = (
            self._period_filter(
                select(
                    Order.customer_phone,
                    func.count(Order.id).label("order_count"),
                    func.min(Order.created_at).label("first_order_at"),
                ),
                restaurant_id,
                period_start,
                period_end,
            )
            .where(Order.status == "delivered")
            .group_by(Order.customer_phone)
        )
        rows = self._session.execute(phone_counts_stmt).all()
        unique_customers = len(rows)
        repeat_customers = sum(1 for row in rows if int(row.order_count or 0) > 1)
        new_customers = sum(
            1
            for row in rows
            if row.first_order_at
            and row.first_order_at >= period_start
            and row.first_order_at <= period_end
        )
        repeat_pct = (
            round((repeat_customers / unique_customers) * 100, 1) if unique_customers else 0.0
        )
        return AnalyticsCustomerStats(
            unique_customers=unique_customers,
            repeat_customers=repeat_customers,
            repeat_customer_pct=repeat_pct,
            new_customers=new_customers,
        )

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
    ) -> AnalyticsDashboard:
        raise NotImplementedError("Use AnalyticsService.get_dashboard")
