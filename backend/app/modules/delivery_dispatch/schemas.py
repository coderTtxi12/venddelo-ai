from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AssignmentSettingsDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    offer_timeout_seconds: int
    pre_free_eta_seconds: int
    driver_location_staleness_seconds: int
    min_protected_drivers: int
    high_demand_available_drivers_max: int
    high_demand_occupied_ratio: float
    high_demand_pending_min: int
    near_destination_radius_meters: int
    max_extra_route_minutes: int
    max_pickup_detour_minutes: int
    max_destination_detour_minutes: int
    max_active_packages_per_driver: int
    assignment_retry_seconds: int
    assignment_timeout_seconds: int
    pre_free_speed_mps: float


class AssignmentSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    offer_timeout_seconds: int | None = Field(default=None, ge=1)
    pre_free_eta_seconds: int | None = Field(default=None, ge=1)
    driver_location_staleness_seconds: int | None = Field(default=None, ge=1)
    min_protected_drivers: int | None = Field(default=None, ge=0)
    high_demand_available_drivers_max: int | None = Field(default=None, ge=0)
    high_demand_occupied_ratio: float | None = Field(default=None, ge=0, le=1)
    high_demand_pending_min: int | None = Field(default=None, ge=0)
    near_destination_radius_meters: int | None = Field(default=None, ge=0)
    max_extra_route_minutes: int | None = Field(default=None, ge=0)
    max_pickup_detour_minutes: int | None = Field(default=None, ge=0)
    max_destination_detour_minutes: int | None = Field(default=None, ge=0)
    max_active_packages_per_driver: int | None = Field(default=None, ge=1)
    assignment_retry_seconds: int | None = Field(default=None, ge=1)
    assignment_timeout_seconds: int | None = Field(default=None, ge=1)


class SearchLeadTimeDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prep_minutes: int
    search_ahead_minutes: int = Field(ge=0)


class SearchLeadTimeUpdate(BaseModel):
    prep_minutes: int
    search_ahead_minutes: int = Field(ge=0)


class DeliveryDriverDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    email: str
    first_name: str
    last_name: str
    phone: str
    profile_photo_path: str
    ine_document_path: str
    license_document_path: str
    insurance_document_path: str
    credit_limit_cents: int
    credit_held_cents: int
    compartment_size: str
    plate: str
    motorcycle_brand: str
    motorcycle_color: str
    status: str
    is_online: bool


class DeliveryDriverCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str
    last_name: str
    phone: str
    email: str
    compartment_size: str
    plate: str
    motorcycle_brand: str
    motorcycle_color: str
    credit_limit_cents: int = Field(default=50000, ge=0)
    profile_photo_base64: str
    profile_photo_file_name: str | None = None
    ine_document_base64: str
    ine_document_file_name: str | None = None
    license_document_base64: str
    license_document_file_name: str | None = None
    insurance_document_base64: str
    insurance_document_file_name: str | None = None


class DeliveryDriverUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    compartment_size: str | None = None
    plate: str | None = None
    motorcycle_brand: str | None = None
    motorcycle_color: str | None = None
    credit_limit_cents: int | None = Field(default=None, ge=0)
    status: str | None = None


class DeliveryDriverDocumentsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    profile_photo_base64: str | None = None
    profile_photo_file_name: str | None = None
    ine_document_base64: str | None = None
    ine_document_file_name: str | None = None
    license_document_base64: str | None = None
    license_document_file_name: str | None = None
    insurance_document_base64: str | None = None
    insurance_document_file_name: str | None = None


PaymentMethod = Literal["cash", "transfer", "card_terminal"]
PackageSize = Literal["normal", "grande"]


class DispatchRequestCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    customer_name: str = Field(min_length=1, max_length=200)
    customer_phone: str = Field(min_length=1, max_length=30)
    dropoff_lat: float | None = Field(default=None, ge=-90, le=90)
    dropoff_lng: float | None = Field(default=None, ge=-180, le=180)
    dropoff_address: str = Field(min_length=1, max_length=500)
    dropoff_maps_url: str | None = Field(default=None, max_length=2000)
    payment_method: PaymentMethod
    collect_cents: int = Field(ge=0)
    cash_denomination_cents: int | None = Field(default=None, ge=0)
    package_size: PackageSize
    package_count: int = Field(ge=1)
    prep_minutes: int = Field(ge=1)
    notes: str | None = Field(default=None, max_length=500)


class DispatchPaymentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    payment_method: PaymentMethod | None = None
    collect_cents: int | None = Field(default=None, ge=0)
    cash_denomination_cents: int | None = Field(default=None, ge=0)


class DispatchRequestDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_name: str
    customer_phone: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    dropoff_maps_url: str | None
    payment_method: str
    collect_cents: int
    cash_denomination_cents: int | None
    package_size: str
    package_count: int
    ready_at: datetime
    search_at: datetime
    next_attempt_at: datetime
    quoted_fee_cents: int
    status: str
    assigned_driver_id: uuid.UUID | None
    tracking_token: str
    notes: str | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TrackingDropoffDTO(BaseModel):
    latitude: float
    longitude: float
    address: str


class TrackingRiderDTO(BaseModel):
    first_name: str


class PublicDispatchTrackingDTO(BaseModel):
    status: str
    dropoff: TrackingDropoffDTO
    rider: TrackingRiderDTO | None = None
    eta_seconds: int | None = None


class RiderProfileDTO(DeliveryDriverDTO):
    last_lat: float | None = None
    last_lng: float | None = None
    location_updated_at: datetime | None = None


class RiderOnlineUpdate(BaseModel):
    is_online: bool


class RiderLocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RiderOfferDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    status: str
    case_applied: str
    expires_at: datetime


class DeliveryTaskPayload(BaseModel):
    kind: Literal["search", "expire_offer", "retry"]
    request_id: uuid.UUID
    offer_id: uuid.UUID | None = None
