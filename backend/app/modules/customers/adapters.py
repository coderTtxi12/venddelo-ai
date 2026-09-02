from __future__ import annotations

import binascii
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.pagination import PaginationParams, decode_cursor, encode_cursor
from app.db.models.delivery import DeliveryDispatchRequest
from app.db.models.orders import Order, OrderItem
from app.modules.customers.grouping import (
    CustomerEvent,
    activity_items,
    apply_customer_filters,
    build_activity_summary,
    customer_stats,
    group_customer_events,
    latest_delivery_address,
    order_display_id,
    sort_activity_items,
    sort_customers,
)
from app.modules.customers.phone import customer_phone_key
from app.modules.customers.schemas import (
    ActivityHistorySort,
    CustomerFrequency,
    CustomerRecency,
    CustomerSort,
    CustomerSortOrder,
    CustomerSource,
    CustomerSpend,
    RestaurantCustomerActivity,
    RestaurantCustomerList,
)


class SqlAlchemyCustomerRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_for_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        query: str | None = None,
        source: CustomerSource | None = None,
        frequency: CustomerFrequency | None = None,
        spend: CustomerSpend | None = None,
        recency: CustomerRecency | None = None,
        sort: CustomerSort = "last_at",
        order: CustomerSortOrder | None = None,
        page: int = 1,
    ) -> RestaurantCustomerList:
        events = self._load_events(restaurant_id)
        customers = group_customer_events(events)
        stats = customer_stats(customers)
        filtered = apply_customer_filters(
            customers,
            query=query,
            source=source,
            frequency=frequency,
            spend=spend,
            recency=recency,
        )
        ordered = sort_customers(filtered, sort, order=order)

        safe_page = max(page, 1)
        offset = (safe_page - 1) * params.limit
        if params.cursor:
            offset = _decode_offset(params.cursor)
        page_items = ordered[offset : offset + params.limit]
        next_offset = offset + len(page_items)
        has_more = next_offset < len(ordered)

        return RestaurantCustomerList(
            items=page_items,
            next_cursor=encode_cursor(str(next_offset)) if has_more else None,
            has_more=has_more,
            stats=stats,
            total=len(ordered),
        )

    def activity_for_phone(
        self,
        restaurant_id: uuid.UUID,
        phone_key: str,
        params: PaginationParams,
        *,
        sort: ActivityHistorySort = "date-desc",
    ) -> RestaurantCustomerActivity | None:
        events = [
            event
            for event in self._load_events(restaurant_id)
            if customer_phone_key(event.customer_phone) == phone_key
        ]
        if not events:
            return None
        customers = group_customer_events(events)
        customer = customers[0]
        last_address, last_maps_url = latest_delivery_address(events)
        all_items = activity_items(events)
        summary = build_activity_summary(all_items)
        ordered = sort_activity_items(all_items, sort)

        offset = _decode_offset(params.cursor)
        page_items = ordered[offset : offset + params.limit]
        next_offset = offset + len(page_items)
        has_more = next_offset < len(ordered)

        return RestaurantCustomerActivity(
            phone_key=customer.phone_key,
            customer_name=customer.customer_name,
            customer_phone=customer.customer_phone,
            summary=summary,
            items=page_items,
            total=len(ordered),
            has_more=has_more,
            next_cursor=encode_cursor(str(next_offset)) if has_more else None,
            last_delivery_address=last_address,
            last_delivery_maps_url=last_maps_url,
        )

    def _load_events(self, restaurant_id: uuid.UUID) -> list[CustomerEvent]:
        events: list[CustomerEvent] = []
        item_quantity = (
            select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .where(OrderItem.order_id == Order.id)
            .correlate(Order)
            .scalar_subquery()
        )
        order_rows = self._session.execute(
            select(
                Order.id,
                Order.customer_name,
                Order.customer_phone,
                Order.created_at,
                Order.total_cents,
                Order.status,
                Order.type,
                Order.note,
                Order.delivery_address,
                Order.delivery_latitude,
                Order.delivery_longitude,
                item_quantity.label("item_quantity"),
            ).where(Order.restaurant_id == restaurant_id)
        ).all()
        for row in order_rows:
            events.append(
                CustomerEvent(
                    id=str(row.id),
                    source="menu",
                    customer_name=row.customer_name,
                    customer_phone=row.customer_phone,
                    created_at=_aware(row.created_at),
                    total_cents=int(row.total_cents or 0),
                    status=row.status,
                    order_type=row.type,
                    display_id=order_display_id(row.note, row.id),
                    delivery_address=row.delivery_address,
                    delivery_latitude=row.delivery_latitude,
                    delivery_longitude=row.delivery_longitude,
                    item_quantity=int(row.item_quantity or 0),
                )
            )

        dispatch_rows = self._session.execute(
            select(
                DeliveryDispatchRequest.id,
                DeliveryDispatchRequest.customer_name,
                DeliveryDispatchRequest.customer_phone,
                DeliveryDispatchRequest.created_at,
                DeliveryDispatchRequest.collect_cents,
                DeliveryDispatchRequest.status,
                DeliveryDispatchRequest.short_id,
                DeliveryDispatchRequest.dropoff_address,
                DeliveryDispatchRequest.dropoff_lat,
                DeliveryDispatchRequest.dropoff_lng,
                DeliveryDispatchRequest.dropoff_maps_url,
                DeliveryDispatchRequest.package_count,
            ).where(
                DeliveryDispatchRequest.restaurant_id == restaurant_id,
                DeliveryDispatchRequest.order_id.is_(None),
            )
        ).all()
        for row in dispatch_rows:
            events.append(
                CustomerEvent(
                    id=str(row.id),
                    source="delivery",
                    customer_name=row.customer_name,
                    customer_phone=row.customer_phone,
                    created_at=_aware(row.created_at),
                    total_cents=int(row.collect_cents or 0),
                    status=row.status,
                    order_type="delivery",
                    display_id=row.short_id,
                    delivery_address=row.dropoff_address,
                    delivery_latitude=row.dropoff_lat,
                    delivery_longitude=row.dropoff_lng,
                    delivery_maps_url=row.dropoff_maps_url,
                    item_quantity=int(row.package_count or 0),
                )
            )
        return events


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _decode_offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        offset = int(decode_cursor(cursor))
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return 0
    return max(offset, 0)
