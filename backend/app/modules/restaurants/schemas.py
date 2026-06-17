import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict


class ScheduleCreate(BaseModel):
    service_type: str
    day_of_week: int
    opens_at: time
    closes_at: time


class ScheduleDTO(ScheduleCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class PaymentMethodCreate(BaseModel):
    method: str
    service_type: str
    enabled: bool = True


class PaymentMethodDTO(PaymentMethodCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class RestaurantCreate(BaseModel):
    name: str
    subdomain: str
    original_language: str = "es"
    status: str = "draft"
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    cover_path: str | None = None
    whatsapp_phone: str | None = None
    color_palette: str | None = None


class RestaurantUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    cover_path: str | None = None
    whatsapp_phone: str | None = None
    color_palette: str | None = None
    original_language: str | None = None
    status: str | None = None


class RestaurantDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    subdomain: str
    original_language: str
    status: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    cover_path: str | None = None
    whatsapp_phone: str | None = None
    color_palette: str | None = None
    owner_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
