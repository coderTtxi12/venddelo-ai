from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.modules.delivery_providers.schemas import (
    DeliveryProviderDTO,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderServiceStatusDTO,
    DeliveryProviderZoneDTO,
)


class DeliveryProviderRepository(ABC):
    @abstractmethod
    def get_for_user(self, user_id: uuid.UUID) -> tuple[DeliveryProviderDTO, str] | None: ...

    @abstractmethod
    def slug_exists(self, slug: str) -> bool: ...

    @abstractmethod
    def create_onboarding(
        self,
        *,
        user_id: uuid.UUID,
        company_name: str,
        slug: str,
        responsible_name: str,
        responsible_phone: str,
        whatsapp_phone: str,
        logo_path: str | None,
        zone_name: str,
        zone_geojson: str,
    ) -> DeliveryProviderDTO: ...

    @abstractmethod
    def set_logo_path(self, provider_id: uuid.UUID, logo_path: str) -> None: ...

    @abstractmethod
    def get_primary_zone(self, provider_id: uuid.UUID) -> DeliveryProviderZoneDTO | None: ...

    @abstractmethod
    def update_profile(
        self,
        provider_id: uuid.UUID,
        *,
        company_name: str,
        responsible_name: str,
        responsible_phone: str,
        whatsapp_phone: str,
        logo_path: str | None,
        zone_name: str,
        zone_geojson: str,
        center_lat: float | None,
        center_lng: float | None,
    ) -> DeliveryProviderDTO: ...

    @abstractmethod
    def list_schedules(self, provider_id: uuid.UUID) -> Sequence[DeliveryProviderScheduleDTO]: ...

    @abstractmethod
    def set_schedules(
        self,
        provider_id: uuid.UUID,
        schedules: Sequence[DeliveryProviderScheduleCreate],
    ) -> None: ...

    @abstractmethod
    def seed_default_schedules(self, provider_id: uuid.UUID) -> None: ...

    @abstractmethod
    def get_service_manually_enabled(self, provider_id: uuid.UUID) -> bool: ...

    @abstractmethod
    def set_service_manually_enabled(self, provider_id: uuid.UUID, enabled: bool) -> bool: ...

    @abstractmethod
    def get_provider_timezone(self, provider_id: uuid.UUID) -> str: ...
