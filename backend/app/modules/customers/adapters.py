from __future__ import annotations

import binascii
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pagination import PaginationParams, decode_cursor, encode_cursor
from app.db.models.delivery import DeliveryDispatchRequest
from app.db.models.orders import Order
from app.modules.customers.grouping import (
    CustomerEvent,
    activity_items,
    customer_stats,
    filter_by_source,
    group_customer_events,
    matches_query,
    order_display_id,
    sort_customers,
)
from app.modules.customers.phone import customer_phone_key
from app.modules.customers.schemas import (
    CustomerSort,
    CustomerSource,
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
        sort: CustomerSort = "last_at",
    ) -> RestaurantCustomerList:
        events = self._load_events(restaurant_id)
        customers = group_customer_events(events)
        stats = customer_stats(customers)
        filtered = filter_by_source(customers, source)
        if query:
            filtered = [customer for customer in filtered if matches_query(customer, query)]
        ordered = sort_customers(filtered, sort)

        offset = _decode_offset(params.cursor)
        page_items = ordered[offset : offset + params.limit]
        next_offset = offset + len(page_items)
        has_more = next_offset < len(ordered)

        return RestaurantCustomerList(
            items=page_items,
            next_cursor=encode_cursor(str(next_offset)) if has_more else None,
            has_more=has_more,
            stats=stats,
        )

    def activity_for_phone(
        self,
        restaurant_id: uuid.UUID,
        phone_key: str,
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
        return RestaurantCustomerActivity(
            phone_key=customer.phone_key,
            customer_name=customer.customer_name,
            customer_phone=customer.customer_phone,
            items=activity_items(events),
        )

    def _load_events(self, restaurant_id: uuid.UUID) -> list[CustomerEvent]:
        events: list[CustomerEvent] = []
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
