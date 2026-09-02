from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.pagination import CursorPage

CustomerSource = Literal["menu", "delivery"]
CustomerSort = Literal["last_at", "visits", "spent", "name"]
CustomerSortOrder = Literal["asc", "desc"]
CustomerFrequency = Literal["new", "repeat"]
CustomerSpend = Literal["spent", "none"]
CustomerRecency = Literal["7d", "30d", "90d"]
ActivityHistorySort = Literal["date-desc", "date-asc", "amount-desc", "amount-asc"]


class RestaurantCustomer(BaseModel):
    phone_key: str
    customer_name: str
    customer_phone: str
    order_count: int = 0
    delivery_count: int = 0
    visit_count: int = 0
    total_spent_cents: int = 0
    last_order_at: datetime
    first_order_at: datetime
    sources: list[CustomerSource] = Field(default_factory=list)


class RestaurantCustomerStats(BaseModel):
    unique_customers: int = 0
    repeat_customers: int = 0
    menu_customers: int = 0
    delivery_customers: int = 0


class RestaurantCustomerList(CursorPage[RestaurantCustomer]):
    stats: RestaurantCustomerStats = Field(default_factory=RestaurantCustomerStats)
    total: int = 0


class RestaurantCustomerActivityItem(BaseModel):
    id: str
    kind: CustomerSource
    created_at: datetime
    total_cents: int
    status: str
    order_type: str | None = None
    display_id: str
    item_quantity: int = 0
    delivery_address: str | None = None
    delivery_maps_url: str | None = None


class RestaurantCustomerActivitySummary(BaseModel):
    menu_count: int = 0
    delivery_count: int = 0
    status_delivered: int = 0
    status_cancelled: int = 0
    status_in_progress: int = 0
    status_other: int = 0
    timeline: list[datetime] = Field(default_factory=list)
    avg_ticket_cents: int | None = None
    avg_item_quantity: float | None = None


class RestaurantCustomerActivity(BaseModel):
    phone_key: str
    customer_name: str
    customer_phone: str
    summary: RestaurantCustomerActivitySummary = Field(
        default_factory=RestaurantCustomerActivitySummary,
    )
    items: list[RestaurantCustomerActivityItem] = Field(default_factory=list)
    total: int = 0
    has_more: bool = False
    next_cursor: str | None = None
    last_delivery_address: str | None = None
    last_delivery_maps_url: str | None = None
