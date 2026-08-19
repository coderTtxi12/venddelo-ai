from __future__ import annotations

import uuid
from datetime import date, datetime
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


class ItineraryStopInput(BaseModel):
    kind: Literal["restaurant", "dropoff"]
    request_id: uuid.UUID


class ManualOfferCreate(BaseModel):
    driver_id: uuid.UUID
    itinerary: list[ItineraryStopInput] | None = None


class ManualOfferDTO(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    driver_id: uuid.UUID
    case_applied: str
    expires_at: datetime
    tracking_token: str
    short_id: str


class DriverItineraryStopDTO(BaseModel):
    sequence: int
    kind: Literal["restaurant", "dropoff"]
    request_id: uuid.UUID
    current: bool = False
    title: str | None = None
    detail: str | None = None
    lat: float | None = None
    lng: float | None = None
    short_id: str | None = None
    action: str | None = None


class ItineraryUpdate(BaseModel):
    stops: list[ItineraryStopInput]


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
    emergency_contact_name: str
    emergency_contact_phone: str
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
    registered_zone_id: uuid.UUID | None = None
    registered_zone_name: str | None = None
    status: str
    is_online: bool


class DeliveryDriverCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str
    last_name: str
    phone: str
    emergency_contact_name: str
    emergency_contact_phone: str
    email: str
    compartment_size: str
    plate: str
    motorcycle_brand: str
    motorcycle_color: str
    registered_zone_id: uuid.UUID | None = None
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
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    email: str | None = None
    compartment_size: str | None = None
    plate: str | None = None
    motorcycle_brand: str | None = None
    motorcycle_color: str | None = None
    registered_zone_id: uuid.UUID | None = None
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
    prep_minutes: int = Field(ge=1, lt=60)
    notes: str | None = Field(default=None, max_length=500)


class MapsUrlResolveDTO(BaseModel):
    latitude: float
    longitude: float
    resolved_url: str | None = None


class DispatchPaymentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    payment_method: PaymentMethod | None = None
    collect_cents: int | None = Field(default=None, ge=0)
    cash_denomination_cents: int | None = Field(default=None, ge=0)


class TrackingRiderDTO(BaseModel):
    first_name: str
    photo_url: str | None = None
    plate_suffix: str
    vehicle_type: str = "moto"
    motorcycle_brand: str
    motorcycle_color: str
    latitude: float | None = None
    longitude: float | None = None
    phone: str


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
    short_id: str
    notes: str | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    rider: TrackingRiderDTO | None = None


class TrackingDropoffDTO(BaseModel):
    latitude: float
    longitude: float
    address: str


class TrackingPickupDTO(BaseModel):
    latitude: float
    longitude: float
    name: str


class PublicDispatchTrackingDTO(BaseModel):
    status: str
    short_id: str
    restaurant_name: str | None = None
    customer_name: str
    pickup: TrackingPickupDTO | None = None
    dropoff: TrackingDropoffDTO
    rider: TrackingRiderDTO | None = None
    eta_seconds: int | None = None
    package_count: int
    payment_method: str
    collect_cents: int | None = None
    cash_denomination_cents: int | None = None


class RiderAssignmentDTO(BaseModel):
    id: uuid.UUID
    short_id: str
    status: str
    restaurant_name: str
    restaurant_address: str | None = None
    dropoff_address: str
    restaurant_lat: float | None = None
    restaurant_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None
    payment_method: str
    collect_cents: int
    cash_denomination_cents: int | None = None
    quoted_fee_cents: int = 0
    package_count: int
    package_size: str
    notes: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    case_applied: str | None = None
    dispatch_group_id: uuid.UUID | None = None


class RiderProfileDTO(DeliveryDriverDTO):
    last_lat: float | None = None
    last_lng: float | None = None
    location_updated_at: datetime | None = None
    assignments: list[RiderAssignmentDTO] = Field(default_factory=list)
    itinerary: list[DriverItineraryStopDTO] = Field(default_factory=list)


class RiderOnlineUpdate(BaseModel):
    is_online: bool


class RiderLocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RiderFcmTokenUpdate(BaseModel):
    fcm_token: str = Field(min_length=1)


class RiderHistoryHoldDTO(BaseModel):
    request_id: uuid.UUID
    short_id: str
    restaurant_name: str
    amount_cents: int
    customer_name: str


class RiderHistoryItemDTO(BaseModel):
    id: uuid.UUID
    short_id: str
    status: str
    closed_at: datetime
    restaurant_name: str
    restaurant_address: str | None = None
    dropoff_address: str
    quoted_fee_cents: int
    payment_method: str
    collect_cents: int
    cash_denomination_cents: int | None = None
    package_count: int
    package_size: str
    customer_name: str | None = None
    customer_phone: str | None = None
    notes: str | None = None
    credit_hold_cents: int = 0


class RiderHistoryPageDTO(BaseModel):
    start: date
    end: date
    items: list[RiderHistoryItemDTO]
    total: int
    delivered_count: int
    cancelled_count: int
    earnings_cents: int
    has_more: bool
    credit_limit_cents: int
    credit_held_cents: int
    credit_available_cents: int
    active_holds: list[RiderHistoryHoldDTO] = Field(default_factory=list)


class DispatchMonitorTimelineEventDTO(BaseModel):
    at: datetime | None = None
    kind: str
    driver_name: str | None = None
    case_applied: str | None = None
    current: bool = False


class ProviderHistoryItemDTO(RiderHistoryItemDTO):
    assigned_driver_id: uuid.UUID | None = None
    assigned_driver_name: str | None = None
    zone_id: uuid.UUID | None = None
    zone_name: str | None = None
    restaurant_id: uuid.UUID
    restaurant_lat: float | None = None
    restaurant_lng: float | None = None
    dropoff_lat: float
    dropoff_lng: float
    dropoff_maps_url: str | None = None
    ready_at: datetime
    search_at: datetime
    created_at: datetime
    cancelled_at: datetime | None = None
    updated_at: datetime
    dispatch_group_id: uuid.UUID | None = None
    case_applied: str | None = None
    credit_hold_status: str | None = None
    timeline: list[DispatchMonitorTimelineEventDTO] = Field(default_factory=list)


class ProviderHistoryPageDTO(BaseModel):
    start: date
    end: date
    items: list[ProviderHistoryItemDTO]
    total: int
    delivered_count: int
    cancelled_count: int
    earnings_cents: int
    has_more: bool


class RiderOfferStopDTO(BaseModel):
    restaurant_name: str
    dropoff_address: str
    short_id: str | None = None
    restaurant_lat: float | None = None
    restaurant_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None
    distance_meters: int | None = None


class RiderOfferDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    short_id: str
    status: str
    case_applied: str
    expires_at: datetime
    restaurant_name: str
    dropoff_address: str
    collect_cents: int
    quoted_fee_cents: int
    payment_method: str
    package_count: int
    restaurant_lat: float | None = None
    restaurant_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None
    distance_meters: int | None = None
    stops: list[RiderOfferStopDTO] = Field(default_factory=list)


class DeliveryTaskPayload(BaseModel):
    kind: Literal["search", "expire_offer", "retry"]
    request_id: uuid.UUID
    offer_id: uuid.UUID | None = None


class DispatchMonitorSearchBlockerDTO(BaseModel):
    code: str
    count: int


class DispatchMonitorMetricsDTO(BaseModel):
    drivers_online: int
    drivers_offline: int
    drivers_location_stale: int
    requests_pending: int
    requests_due_search: int
    requests_in_progress: int
    offers_open: int
    credit_holds_active: int
    drivers_credit_blocked: int
    high_demand: bool
    requests_unassigned: int
    high_demand_few_free: bool = False
    high_demand_high_occupancy: bool = False
    high_demand_large_queue: bool = False
    high_demand_free_count: int = 0
    high_demand_occupied_ratio: float = 0.0
    assignment_timeout_seconds: int = 900
    offer_timeout_seconds: int = 45
    assignment_retry_seconds: int = 30
    max_active_packages_per_driver: int = 3
    tasks_backend: str = "stub"


class DispatchMonitorDriverDTO(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    phone: str
    is_online: bool
    status: str
    plate: str
    motorcycle_color: str
    compartment_size: str
    profile_photo_path: str
    last_lat: float | None = None
    last_lng: float | None = None
    location_updated_at: datetime | None = None
    location_stale: bool
    location_age_seconds: int | None = None
    credit_limit_cents: int
    credit_held_cents: int
    credit_available_cents: int
    credit_blocked: bool
    active_request_id: uuid.UUID | None = None
    active_request_status: str | None = None
    open_offer_id: uuid.UUID | None = None
    is_pre_free: bool = False
    pre_free_eta_seconds: int | None = None
    occupied_job_count: int = 0
    active_package_count: int = 0
    registered_zone_id: uuid.UUID | None = None
    registered_zone_name: str | None = None
    itinerary: list[DriverItineraryStopDTO] = Field(default_factory=list)


class DispatchMonitorRequestDTO(BaseModel):
    id: uuid.UUID
    short_id: str
    status: str
    customer_name: str
    customer_phone: str
    restaurant_id: uuid.UUID
    restaurant_name: str
    restaurant_address: str | None = None
    restaurant_phone: str | None = None
    restaurant_logo_path: str | None = None
    restaurant_lat: float | None = None
    restaurant_lng: float | None = None
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    dropoff_maps_url: str | None = None
    payment_method: str
    collect_cents: int
    cash_denomination_cents: int | None = None
    search_at: datetime
    ready_at: datetime
    next_attempt_at: datetime
    assignment_timeout_at: datetime
    is_due_search: bool
    assigned_driver_id: uuid.UUID | None = None
    assigned_driver_name: str | None = None
    last_assigned_driver_name: str | None = None
    dispatch_group_id: uuid.UUID | None = None
    zone_id: uuid.UUID | None = None
    zone_name: str | None = None
    package_size: str
    package_count: int = 1
    quoted_fee_cents: int = 0
    notes: str | None = None
    last_case: str | None = None
    last_decision: dict | None = None
    eligible_driver_count: int = 0
    search_blockers: list[DispatchMonitorSearchBlockerDTO] = Field(default_factory=list)
    cycle_rejected_count: int = 0
    cycle_silent_count: int = 0
    created_at: datetime | None = None
    timeline: list[DispatchMonitorTimelineEventDTO] = Field(default_factory=list)


class DispatchMonitorOfferDTO(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    short_id: str
    driver_id: uuid.UUID
    driver_name: str
    status: str
    case_applied: str
    expires_at: datetime
    customer_name: str
    restaurant_name: str
    dropoff_address: str | None = None
    score_json: dict | None = None


class DispatchMonitorCreditHoldDTO(BaseModel):
    id: uuid.UUID
    driver_id: uuid.UUID
    driver_name: str
    request_id: uuid.UUID
    short_id: str
    amount_cents: int
    status: str
    customer_name: str
    restaurant_name: str


class DispatchMonitorRouteDTO(BaseModel):
    request_id: uuid.UUID
    short_id: str
    driver_id: uuid.UUID
    driver_name: str
    status: str
    origin_lat: float
    origin_lng: float
    origin_label: str
    destination_lat: float
    destination_lng: float
    destination_label: str
    zone_id: uuid.UUID | None = None


class DispatchMonitorSnapshotDTO(BaseModel):
    generated_at: datetime
    metrics: DispatchMonitorMetricsDTO
    drivers: list[DispatchMonitorDriverDTO]
    requests: list[DispatchMonitorRequestDTO]
    offers: list[DispatchMonitorOfferDTO]
    credit_holds: list[DispatchMonitorCreditHoldDTO]
    routes: list[DispatchMonitorRouteDTO]


class AssignmentLogEventDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    at: datetime
    kind: str
    tone: str
    title: str
    detail: str | None = None
    next_attempt_at: datetime | None = None


class AssignmentLogDTO(BaseModel):
    request_id: uuid.UUID
    last_search_at: datetime | None
    next_attempt_at: datetime | None
    assignment_timeout_at: datetime | None
    events: list[AssignmentLogEventDTO]
