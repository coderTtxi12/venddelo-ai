import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class OrderItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    product_name: str
    quantity: int
    unit_price_cents: int
    selected_options: dict[str, Any] | None = None
    line_total_cents: int


class OrderItemDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None = None
    product_name: str
    quantity: int
    unit_price_cents: int
    selected_options: dict[str, Any] | None = None
    line_total_cents: int


class OrderCreate(BaseModel):
    restaurant_id: uuid.UUID
    type: str
    customer_name: str
    customer_phone: str
    payment_method: str
    subtotal_cents: int
    total_cents: int
    delivery_address: str | None = None
    status: str = "pending"
    idempotency_key: str | None = None
    note: str | None = None
    items: list[OrderItemCreate] = []


class OrderDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    type: str
    customer_name: str
    customer_phone: str
    payment_method: str
    subtotal_cents: int
    total_cents: int
    status: str
    delivery_address: str | None = None
    idempotency_key: str | None = None
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemDTO] = []


class PublicOrderItemInput(BaseModel):
    product_id: uuid.UUID
    quantity: int
    selected_options: dict[str, Any] | None = None


class PublicOrderInput(BaseModel):
    type: str
    customer_name: str
    customer_phone: str
    payment_method: str
    delivery_address: str | None = None
    note: str | None = None
    items: list[PublicOrderItemInput]


class OrderStatusUpdate(BaseModel):
    status: str
