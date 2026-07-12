import uuid
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    description: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    cover_path: str | None = None
    digital_menu_theme_id: str = "original"
    digital_menu_promotions_category_enabled: bool = True
    digital_menu_promotions_category_name: str = "Promociones"
    digital_menu_limited_time_category_enabled: bool = True
    digital_menu_limited_time_category_name: str = "Por tiempo limitado"
    whatsapp_phone: str | None = None
    owner_contact_name: str | None = None
    owner_phone: str | None = None
    color_palette: str | None = None
    takeout_enabled: bool = True
    delivery_enabled: bool = True
    timezone: str = "America/Mexico_City"


class RestaurantUpdate(BaseModel):
    name: str | None = None
    subdomain: str | None = None
    description: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    cover_path: str | None = None
    digital_menu_theme_id: str | None = None
    digital_menu_promotions_category_enabled: bool | None = None
    digital_menu_promotions_category_name: str | None = None
    digital_menu_limited_time_category_enabled: bool | None = None
    digital_menu_limited_time_category_name: str | None = None
    whatsapp_phone: str | None = None
    owner_contact_name: str | None = None
    owner_phone: str | None = None
    color_palette: str | None = None
    original_language: str | None = None
    status: str | None = None
    takeout_enabled: bool | None = None
    delivery_enabled: bool | None = None
    timezone: str | None = None


class SubdomainAvailabilityDTO(BaseModel):
    subdomain: str
    available: bool
    valid: bool
    message: str | None = None


class RestaurantDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    subdomain: str
    original_language: str
    status: str
    description: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    cover_path: str | None = None
    digital_menu_theme_id: str = "original"
    digital_menu_promotions_category_enabled: bool = True
    digital_menu_promotions_category_name: str = "Promociones"
    digital_menu_limited_time_category_enabled: bool = True
    digital_menu_limited_time_category_name: str = "Por tiempo limitado"
    whatsapp_phone: str | None = None
    owner_contact_name: str | None = None
    owner_phone: str | None = None
    color_palette: str | None = None
    owner_id: uuid.UUID | None = None
    takeout_enabled: bool = True
    delivery_enabled: bool = True
    timezone: str = "America/Mexico_City"
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RestaurantMeResponse(BaseModel):
    restaurant: RestaurantDTO | None = None
    member_role: str | None = None


class RestaurantAccessItem(BaseModel):
    restaurant: RestaurantDTO
    member_role: Literal["owner", "admin"]
    member_id: uuid.UUID
    last_accessed_at: datetime | None = None


class RestaurantAccessListResponse(BaseModel):
    items: list[RestaurantAccessItem]


class RestaurantSelectRequest(BaseModel):
    restaurant_id: uuid.UUID


class RestaurantAdminInviteDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    created_at: datetime


class RestaurantAdminInviteCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class RestaurantMemberDTO(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str | None = None
    display_name: str | None = None
    member_role: Literal["owner", "admin"]
    created_at: datetime
