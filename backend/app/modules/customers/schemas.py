from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.pagination import CursorPage

CustomerSource = Literal["menu", "delivery"]
CustomerSort = Literal["last_at", "visits", "spent", "name"]


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


class RestaurantCustomerActivityItem(BaseModel):
    id: str
    kind: CustomerSource
    created_at: datetime
    total_cents: int
    status: str
    order_type: str | None = None
    display_id: str


class RestaurantCustomerActivity(BaseModel):
    phone_key: str
    customer_name: str
    customer_phone: str
    items: list[RestaurantCustomerActivityItem] = Field(default_factory=list)
