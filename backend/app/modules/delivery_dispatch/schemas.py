from __future__ import annotations

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
    offer_timeout_seconds: int = Field(ge=1)
    pre_free_eta_seconds: int = Field(ge=1)
    driver_location_staleness_seconds: int = Field(ge=1)
    min_protected_drivers: int = Field(ge=0)
    high_demand_available_drivers_max: int = Field(ge=0)
    high_demand_occupied_ratio: float = Field(ge=0, le=1)
    high_demand_pending_min: int = Field(ge=0)
    near_destination_radius_meters: int = Field(ge=0)
    max_extra_route_minutes: int = Field(ge=0)
    max_pickup_detour_minutes: int = Field(ge=0)
    max_destination_detour_minutes: int = Field(ge=0)
    max_active_packages_per_driver: int = Field(ge=1)
    assignment_retry_seconds: int = Field(ge=1)
    assignment_timeout_seconds: int = Field(ge=1)


class SearchLeadTimeDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prep_minutes: int
    search_ahead_minutes: int = Field(ge=0)


class SearchLeadTimeUpdate(BaseModel):
    prep_minutes: int
    search_ahead_minutes: int = Field(ge=0)
