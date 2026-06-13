import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PromotionCreate(BaseModel):
    restaurant_id: uuid.UUID
    name: str
    type: str
    scope: str
    percent: int | None = None
    amount_cents: int | None = None
    min_order_cents: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    product_ids: list[uuid.UUID] = []
    category_ids: list[uuid.UUID] = []


class PromotionUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    scope: str | None = None
    percent: int | None = None
    amount_cents: int | None = None
    min_order_cents: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class PromotionDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    type: str
    scope: str
    percent: int | None = None
    amount_cents: int | None = None
    min_order_cents: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    product_ids: list[uuid.UUID] = []
    category_ids: list[uuid.UUID] = []
