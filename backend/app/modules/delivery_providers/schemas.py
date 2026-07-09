from __future__ import annotations

import uuid
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DeliveryProviderScheduleKind = Literal["regular", "night"]
DeliveryWeatherMode = Literal["none", "light", "heavy", "intense"]
DeliveryPaymentMethodKey = Literal["cash", "transfer", "card_terminal"]


class GeoJsonPolygon(BaseModel):
    type: str = Field(default="Polygon")
    coordinates: list[list[list[float]]]


class DeliveryProviderOnboardingSubmit(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    responsible_name: str = Field(min_length=2, max_length=200)
    responsible_phone: str = Field(min_length=8, max_length=20)
    whatsapp_phone: str = Field(min_length=8, max_length=20)
    service_zone_name: str = Field(default="Cobertura principal", max_length=200)
    service_zone_polygon: GeoJsonPolygon
    logo_base64: str | None = None
    logo_file_name: str | None = None


class DeliveryProviderDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    legal_name: str | None
    contact_email: str | None
    contact_phone: str | None
    responsible_name: str | None
    responsible_phone: str | None
    whatsapp_phone: str | None
    logo_path: str | None
    timezone: str
    status: str
    service_manually_enabled: bool
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DeliveryProviderZoneDTO(BaseModel):
    id: uuid.UUID
    name: str
    polygon: GeoJsonPolygon | None = None
    center_lat: float | None = None
    center_lng: float | None = None


class DeliveryProviderProfileUpdate(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    responsible_name: str = Field(min_length=2, max_length=200)
    responsible_phone: str = Field(min_length=8, max_length=20)
    whatsapp_phone: str = Field(min_length=8, max_length=20)
    service_zone_name: str = Field(default="Cobertura principal", max_length=200)
    service_zone_polygon: GeoJsonPolygon
    center_lat: float | None = None
    center_lng: float | None = None
    logo_base64: str | None = None
    logo_file_name: str | None = None


class DeliveryProviderMeResponse(BaseModel):
    provider: DeliveryProviderDTO | None
    member_role: str | None = None
    primary_zone: DeliveryProviderZoneDTO | None = None


class DeliveryProviderScheduleCreate(BaseModel):
    schedule_kind: DeliveryProviderScheduleKind
    day_of_week: int = Field(ge=0, le=6)
    opens_at: time
    closes_at: time


class DeliveryProviderScheduleDTO(DeliveryProviderScheduleCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class DeliveryProviderServiceStatusDTO(BaseModel):
    manually_enabled: bool
    within_schedule: bool
    service_active: bool
    status_reason: Literal["active", "manual_off", "outside_schedule"]
    next_change_at: datetime | None = None
    timezone: str


class DeliveryProviderServiceStatusUpdate(BaseModel):
    manually_enabled: bool


class DeliveryProviderPaymentMethodDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    method: DeliveryPaymentMethodKey
    enabled: bool


class DeliveryProviderPaymentMethodCreate(BaseModel):
    method: DeliveryPaymentMethodKey
    enabled: bool


class InsideWeatherTariffsDTO(BaseModel):
    day_cents: int = Field(ge=0)
    night_cents: int = Field(ge=0)


class InsidePolygonTariffsDTO(BaseModel):
    none: InsideWeatherTariffsDTO
    light: InsideWeatherTariffsDTO
    heavy: InsideWeatherTariffsDTO


class OutsideTariffBracketDTO(BaseModel):
    min_km: float = Field(ge=0)
    max_km: float = Field(gt=0)
    repa_cents: int = Field(ge=0)
    mexy_cents: int = Field(ge=0)
    restaurant_cents: int = Field(ge=0)
    rain_light_cents: int = Field(ge=0)
    rain_heavy_cents: int = Field(ge=0)


class OutsidePolygonTariffsDTO(BaseModel):
    max_distance_km: float = Field(gt=0, le=100)
    brackets: list[OutsideTariffBracketDTO]


class DeliveryProviderPricingConfigDTO(BaseModel):
    inside_polygon: InsidePolygonTariffsDTO
    outside_polygon: OutsidePolygonTariffsDTO


class DeliveryProviderPricingResponse(BaseModel):
    weather_mode: DeliveryWeatherMode
    config: DeliveryProviderPricingConfigDTO


class DeliveryProviderPricingUpdate(BaseModel):
    config: DeliveryProviderPricingConfigDTO


class DeliveryProviderWeatherModeUpdate(BaseModel):
    weather_mode: DeliveryWeatherMode


class DeliveryPricingSimulateRequest(BaseModel):
    inside_polygon: bool
    distance_km: float | None = Field(default=None, ge=0, le=100)
    is_night: bool = False
    weather_mode: DeliveryWeatherMode | None = None


class DeliveryPricingQuoteDTO(BaseModel):
    available: bool
    reason: str | None = None
    total_cents: int
    repa_cents: int
    mexy_cents: int
    restaurant_cents: int
    inside_polygon: bool
    distance_km: float | None = None
    weather_mode: DeliveryWeatherMode
    is_night: bool


class DeliveryPartnershipRestaurantDTO(BaseModel):
    id: uuid.UUID
    name: str
    subdomain: str
    description: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    whatsapp_phone: str | None = None
    owner_display_name: str | None = None
    owner_phone: str | None = None
    logo_path: str | None = None
    status: str
    delivery_enabled: bool


class DeliveryPartnershipRequestDTO(BaseModel):
    id: uuid.UUID
    status: str
    is_default: bool
    created_at: datetime
    activated_at: datetime | None = None
    restaurant: DeliveryPartnershipRestaurantDTO


class RestaurantDeliveryPartnershipDTO(BaseModel):
    id: uuid.UUID
    provider_name: str
    provider_slug: str
    status: Literal["pending", "active", "suspended"]
    is_default: bool
    created_at: datetime
    activated_at: datetime | None = None


class RestaurantDeliveryPartnershipResponse(BaseModel):
    partnership: RestaurantDeliveryPartnershipDTO | None = None


class DeliveryProviderAdminInviteDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    created_at: datetime


class DeliveryProviderAdminInviteCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
