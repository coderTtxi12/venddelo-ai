from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.coupons.status import CouponEffectiveStatus


class CouponCreate(BaseModel):
    restaurant_id: uuid.UUID | None = None
    code: str
    name: str
    type: str
    percent: int | None = None
    amount_cents: int | None = None
    scope: str
    stock_qty: int | None = None
    starts_on: date | None = None
    expires_on: date | None = None
    recurrence_weekdays: list[int] | None = None
    is_active: bool = True
    product_ids: list[uuid.UUID] = Field(default_factory=list)
    category_ids: list[uuid.UUID] = Field(default_factory=list)


class CouponUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    type: str | None = None
    percent: int | None = None
    amount_cents: int | None = None
    scope: str | None = None
    stock_qty: int | None = None
    starts_on: date | None = None
    expires_on: date | None = None
    recurrence_weekdays: list[int] | None = None
    is_active: bool | None = None
    product_ids: list[uuid.UUID] | None = None
    category_ids: list[uuid.UUID] | None = None


class CouponDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    code: str
    name: str
    type: str
    percent: int | None = None
    amount_cents: int | None = None
    scope: str
    stock_qty: int | None = None
    starts_on: date | None = None
    expires_on: date | None = None
    recurrence_weekdays: list[int] | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    product_ids: list[uuid.UUID] = Field(default_factory=list)
    category_ids: list[uuid.UUID] = Field(default_factory=list)
    redeemed_count: int = 0
    remaining_qty: int | None = None
    effective_status: CouponEffectiveStatus | None = None


class CouponApplicationDTO(BaseModel):
    order_id: uuid.UUID
    customer_name: str
    customer_phone: str
    status: str
    total_cents: int
    coupon_discount_cents: int
    created_at: datetime
    redeemed: bool = False
