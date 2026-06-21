from __future__ import annotations

import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from app.modules.promotions.types import normalize_promotion_type, serialize_promotion_type


class PromotionBundle(BaseModel):
    get_quantity: int = Field(ge=2)
    pay_quantity: int = Field(ge=1)
    pairing_mode: str = "cross_product"

    @model_validator(mode="after")
    def pay_less_than_get(self) -> PromotionBundle:
        if self.pay_quantity >= self.get_quantity:
            raise ValueError("pay_quantity must be less than get_quantity")
        if self.pairing_mode not in {"cross_product", "same_product"}:
            raise ValueError("pairing_mode must be cross_product or same_product")
        return self


class PromotionScheduleInput(BaseModel):
    weekdays: list[int] = Field(default_factory=list)
    use_time_window: bool = False
    daily_start_time: str | None = None  # HH:MM
    daily_end_time: str | None = None


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != 2:
        raise ValueError("time must be HH:MM")
    hour, minute = int(parts[0]), int(parts[1])
    return time(hour, minute)


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
    bundle: PromotionBundle | None = None
    schedule: PromotionScheduleInput | None = None
    product_ids: list[uuid.UUID] = []
    category_ids: list[uuid.UUID] = []
    option_item_ids: list[uuid.UUID] = []

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return normalize_promotion_type(v)

    @field_validator("schedule")
    @classmethod
    def validate_weekdays(cls, v: PromotionScheduleInput | None) -> PromotionScheduleInput | None:
        if v is None:
            return v
        for day in v.weekdays:
            if day < 0 or day > 6:
                raise ValueError("weekday must be 0-6")
        return v


class PromotionUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    scope: str | None = None
    percent: int | None = None
    amount_cents: int | None = None
    min_order_cents: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    bundle: PromotionBundle | None = None
    schedule: PromotionScheduleInput | None = None
    product_ids: list[uuid.UUID] | None = None
    category_ids: list[uuid.UUID] | None = None
    option_item_ids: list[uuid.UUID] | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return normalize_promotion_type(v)

    @field_validator("schedule")
    @classmethod
    def validate_weekdays(cls, v: PromotionScheduleInput | None) -> PromotionScheduleInput | None:
        if v is None:
            return v
        for day in v.weekdays:
            if day < 0 or day > 6:
                raise ValueError("weekday must be 0-6")
        return v


class PromotionScheduleDTO(BaseModel):
    weekdays: list[int] = Field(default_factory=list)
    use_time_window: bool = False
    daily_start_time: str | None = None
    daily_end_time: str | None = None


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
    bundle_get_quantity: int | None = None
    bundle_pay_quantity: int | None = None
    bundle_pairing_mode: str | None = None
    recurrence_weekdays: list[int] | None = None
    recurrence_start_time: time | None = None
    recurrence_end_time: time | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    product_ids: list[uuid.UUID] = []
    category_ids: list[uuid.UUID] = []
    option_item_ids: list[uuid.UUID] = []
    bundle: PromotionBundle | None = None
    schedule: PromotionScheduleDTO | None = None
    effective_status: str | None = None

    @field_serializer("type")
    def serialize_type(self, value: str) -> str:
        return serialize_promotion_type(value)


def enrich_promotion_dto(dto: PromotionDTO) -> PromotionDTO:
    if dto.bundle_get_quantity and dto.bundle_pay_quantity:
        dto.bundle = PromotionBundle(
            get_quantity=dto.bundle_get_quantity,
            pay_quantity=dto.bundle_pay_quantity,
            pairing_mode=dto.bundle_pairing_mode or "cross_product",
        )
    weekdays = dto.recurrence_weekdays or []
    use_time = bool(dto.recurrence_start_time or dto.recurrence_end_time)
    if weekdays or use_time:
        dto.schedule = PromotionScheduleDTO(
            weekdays=weekdays,
            use_time_window=use_time,
            daily_start_time=(
                dto.recurrence_start_time.strftime("%H:%M") if dto.recurrence_start_time else None
            ),
            daily_end_time=(
                dto.recurrence_end_time.strftime("%H:%M") if dto.recurrence_end_time else None
            ),
        )
    return dto
