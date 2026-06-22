from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
