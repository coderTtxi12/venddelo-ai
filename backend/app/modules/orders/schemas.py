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
    line_subtotal_cents: int = 0
    discount_cents: int = 0
    line_total_cents: int
    applied_promotion_id: uuid.UUID | None = None


class OrderItemDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None = None
    product_name: str
    quantity: int
    unit_price_cents: int
    selected_options: dict[str, Any] | None = None
    line_subtotal_cents: int = 0
    discount_cents: int = 0
    line_total_cents: int
    applied_promotion_id: uuid.UUID | None = None


class OrderCreate(BaseModel):
    restaurant_id: uuid.UUID
    type: str
    customer_name: str
    customer_phone: str
    payment_method: str
    subtotal_cents: int
    subtotal_before_discount_cents: int = 0
    discount_cents: int = 0
    total_cents: int
    applied_order_promotion_id: uuid.UUID | None = None
    delivery_address: str | None = None
    delivery_fee_cents: int = 0
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
    subtotal_before_discount_cents: int = 0
    discount_cents: int = 0
    total_cents: int
    applied_order_promotion_id: uuid.UUID | None = None
    status: str
    delivery_address: str | None = None
    delivery_fee_cents: int = 0
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
    delivery_fee_cents: int = 0
    note: str | None = None
    items: list[PublicOrderItemInput]


class OrderStatusUpdate(BaseModel):
    status: str
