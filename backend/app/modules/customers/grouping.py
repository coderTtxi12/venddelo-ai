from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from app.modules.customers.phone import LEGACY_WHATSAPP_KEY, customer_phone_key
from app.modules.customers.schemas import (
    CustomerSource,
    RestaurantCustomer,
    RestaurantCustomerActivityItem,
    RestaurantCustomerStats,
)

_ORDER_REF = re.compile(r"Ref\.?\s*pedido\s*#?([A-Z0-9]{5,12})", re.IGNORECASE)


@dataclass(frozen=True)
class CustomerEvent:
    id: str
    source: CustomerSource
    customer_name: str
    customer_phone: str
    created_at: datetime
    total_cents: int
    status: str
    order_type: str | None
    display_id: str


def order_display_id(note: str | None, order_id: UUID) -> str:
    if note:
        match = _ORDER_REF.search(note)
        if match:
            return match.group(1).upper()[:5]
    return str(order_id).replace("-", "")[:5].upper()


def _is_legacy_whatsapp(phone: str) -> bool:
    return phone.strip().lower() == LEGACY_WHATSAPP_KEY


def _counts_as_spend(event: CustomerEvent) -> bool:
    return event.status == "delivered"


def group_customer_events(events: list[CustomerEvent]) -> list[RestaurantCustomer]:
    buckets: dict[str, list[CustomerEvent]] = {}
    for event in events:
        buckets.setdefault(customer_phone_key(event.customer_phone), []).append(event)

    customers: list[RestaurantCustomer] = []
    for phone_key, items in buckets.items():
        items.sort(key=lambda event: event.created_at, reverse=True)
        latest = items[0]
        display_phone = next(
            (event.customer_phone for event in items if not _is_legacy_whatsapp(event.customer_phone)),
            latest.customer_phone,
        )
        display_name = next(
            (event.customer_name.strip() for event in items if event.customer_name.strip()),
            latest.customer_name,
        )
        sources: list[CustomerSource] = []
        for source in ("menu", "delivery"):
            if any(event.source == source for event in items):
                sources.append(source)

        order_count = sum(1 for event in items if event.source == "menu")
        delivery_count = sum(1 for event in items if event.source == "delivery")
        customers.append(
            RestaurantCustomer(
                phone_key=phone_key,
                customer_name=display_name,
                customer_phone=display_phone,
                order_count=order_count,
                delivery_count=delivery_count,
                visit_count=len(items),
                total_spent_cents=sum(
                    event.total_cents for event in items if _counts_as_spend(event)
                ),
                last_order_at=items[0].created_at,
                first_order_at=items[-1].created_at,
                sources=sources,
            )
        )
    return customers


def customer_stats(customers: list[RestaurantCustomer]) -> RestaurantCustomerStats:
    return RestaurantCustomerStats(
        unique_customers=len(customers),
        repeat_customers=sum(1 for customer in customers if customer.visit_count >= 2),
        menu_customers=sum(1 for customer in customers if "menu" in customer.sources),
        delivery_customers=sum(1 for customer in customers if "delivery" in customer.sources),
    )


def activity_items(events: list[CustomerEvent], *, limit: int = 50) -> list[RestaurantCustomerActivityItem]:
    ordered = sorted(events, key=lambda event: event.created_at, reverse=True)[:limit]
    return [
        RestaurantCustomerActivityItem(
            id=event.id,
            kind=event.source,
            created_at=event.created_at,
            total_cents=event.total_cents,
            status=event.status,
            order_type=event.order_type,
            display_id=event.display_id,
        )
        for event in ordered
    ]


def matches_query(customer: RestaurantCustomer, query: str) -> bool:
    needle = query.strip().casefold()
    if not needle:
        return True
    haystacks = [
        customer.customer_name.casefold(),
        customer.customer_phone.casefold(),
        customer.phone_key.casefold(),
        "".join(ch for ch in customer.customer_phone if ch.isdigit()),
    ]
    return any(needle in haystack for haystack in haystacks)


def sort_customers(
    customers: list[RestaurantCustomer],
    sort: Literal["last_at", "visits", "spent", "name"] = "last_at",
) -> list[RestaurantCustomer]:
    if sort == "visits":
        return sorted(
            customers,
            key=lambda customer: (-customer.visit_count, -customer.last_order_at.timestamp()),
        )
    if sort == "spent":
        return sorted(
            customers,
            key=lambda customer: (-customer.total_spent_cents, -customer.last_order_at.timestamp()),
        )
    if sort == "name":
        return sorted(
            customers,
            key=lambda customer: (customer.customer_name.casefold(), customer.phone_key),
        )
    return sorted(
        customers,
        key=lambda customer: (-customer.last_order_at.timestamp(), customer.phone_key),
    )


def filter_by_source(
    customers: list[RestaurantCustomer],
    source: CustomerSource | None,
) -> list[RestaurantCustomer]:
    if source is None:
        return customers
    return [customer for customer in customers if source in customer.sources]
