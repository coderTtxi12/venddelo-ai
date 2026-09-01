from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.modules.customers.phone import LEGACY_WHATSAPP_KEY, customer_phone_key
from app.modules.customers.schemas import (
    CustomerFrequency,
    CustomerRecency,
    CustomerSort,
    CustomerSortOrder,
    CustomerSource,
    CustomerSpend,
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
    delivery_address: str | None = None
    delivery_latitude: float | None = None
    delivery_longitude: float | None = None
    delivery_maps_url: str | None = None
    item_quantity: int = 0


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


def _is_delivery_event(event: CustomerEvent) -> bool:
    return event.source == "delivery" or event.order_type == "delivery"


def latest_delivery_address(events: list[CustomerEvent]) -> tuple[str | None, str | None]:
    ordered = sorted(events, key=lambda event: event.created_at, reverse=True)
    for event in ordered:
        address = (event.delivery_address or "").strip()
        if not address or not _is_delivery_event(event):
            continue
        maps_url = (event.delivery_maps_url or "").strip() or None
        if maps_url is None and event.delivery_latitude is not None and event.delivery_longitude is not None:
            maps_url = f"https://www.google.com/maps?q={event.delivery_latitude},{event.delivery_longitude}"
        return address, maps_url
    return None, None


def activity_items(
    events: list[CustomerEvent],
    *,
    limit: int | None = None,
) -> list[RestaurantCustomerActivityItem]:
    ordered = sorted(events, key=lambda event: event.created_at, reverse=True)
    if limit is not None:
        ordered = ordered[:limit]
    return [
        RestaurantCustomerActivityItem(
            id=event.id,
            kind=event.source,
            created_at=event.created_at,
            total_cents=event.total_cents,
            status=event.status,
            order_type=event.order_type,
            display_id=event.display_id,
            item_quantity=event.item_quantity,
            delivery_address=event.delivery_address,
            delivery_maps_url=event.delivery_maps_url,
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
    sort: CustomerSort = "last_at",
    order: CustomerSortOrder | None = None,
) -> list[RestaurantCustomer]:
    descending = (sort != "name") if order is None else order == "desc"
    if sort == "visits":
        ordered = sorted(
            customers,
            key=lambda customer: (customer.visit_count, customer.last_order_at.timestamp(), customer.phone_key),
        )
    elif sort == "spent":
        ordered = sorted(
            customers,
            key=lambda customer: (
                customer.total_spent_cents,
                customer.last_order_at.timestamp(),
                customer.phone_key,
            ),
        )
    elif sort == "name":
        ordered = sorted(
            customers,
            key=lambda customer: (customer.customer_name.casefold(), customer.phone_key),
        )
    else:
        ordered = sorted(
            customers,
            key=lambda customer: (customer.last_order_at.timestamp(), customer.phone_key),
        )
    if descending:
        ordered.reverse()
    return ordered


def filter_by_source(
    customers: list[RestaurantCustomer],
    source: CustomerSource | None,
) -> list[RestaurantCustomer]:
    if source is None:
        return customers
    return [customer for customer in customers if source in customer.sources]


_RECENCY_DAYS: dict[CustomerRecency, int] = {"7d": 7, "30d": 30, "90d": 90}


def apply_customer_filters(
    customers: list[RestaurantCustomer],
    *,
    query: str | None = None,
    source: CustomerSource | None = None,
    frequency: CustomerFrequency | None = None,
    spend: CustomerSpend | None = None,
    recency: CustomerRecency | None = None,
    now: datetime | None = None,
) -> list[RestaurantCustomer]:
    filtered = filter_by_source(customers, source)
    if query:
        filtered = [customer for customer in filtered if matches_query(customer, query)]
    if frequency == "new":
        filtered = [customer for customer in filtered if customer.visit_count == 1]
    elif frequency == "repeat":
        filtered = [customer for customer in filtered if customer.visit_count >= 2]
    if spend == "spent":
        filtered = [customer for customer in filtered if customer.total_spent_cents > 0]
    elif spend == "none":
        filtered = [customer for customer in filtered if customer.total_spent_cents <= 0]
    if recency is not None:
        current = now or datetime.now(UTC)
        if current.tzinfo is None:
            current = current.replace(tzinfo=UTC)
        cutoff = current - timedelta(days=_RECENCY_DAYS[recency])
        filtered = [
            customer
            for customer in filtered
            if customer.last_order_at >= cutoff
        ]
    return filtered
