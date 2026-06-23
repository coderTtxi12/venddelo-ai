from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.modules.delivery_providers.schemas import (
    DeliveryPartnershipRequestDTO,
    DeliveryProviderDTO,
    DeliveryProviderPricingConfigDTO,
    DeliveryProviderPaymentMethodCreate,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderServiceStatusDTO,
    DeliveryProviderZoneDTO,
    RestaurantDeliveryPartnershipDTO,
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
    def point_in_primary_zone(
        self, provider_id: uuid.UUID, latitude: float, longitude: float
    ) -> bool: ...

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

    @abstractmethod
    def get_pricing_config(self, provider_id: uuid.UUID) -> DeliveryProviderPricingConfigDTO | None: ...

    @abstractmethod
    def set_pricing_config(
        self, provider_id: uuid.UUID, config: DeliveryProviderPricingConfigDTO
    ) -> DeliveryProviderPricingConfigDTO: ...

    @abstractmethod
    def seed_default_pricing_config(self, provider_id: uuid.UUID) -> None: ...

    @abstractmethod
    def list_payment_methods(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryProviderPaymentMethodDTO]: ...

    @abstractmethod
    def set_payment_methods(
        self,
        provider_id: uuid.UUID,
        methods: Sequence[DeliveryProviderPaymentMethodCreate],
    ) -> None: ...

    @abstractmethod
    def seed_default_payment_methods(self, provider_id: uuid.UUID) -> None: ...

    @abstractmethod
    def get_weather_mode(self, provider_id: uuid.UUID) -> str: ...

    @abstractmethod
    def set_weather_mode(self, provider_id: uuid.UUID, weather_mode: str) -> str: ...

    @abstractmethod
    def get_mexy_provider_id(self) -> uuid.UUID | None: ...

    @abstractmethod
    def get_mexy_provider_ids(self) -> Sequence[uuid.UUID]: ...

    @abstractmethod
    def user_is_mexy_courier(self, user_id: uuid.UUID) -> bool: ...

    @abstractmethod
    def get_or_create_mexy_provider_id(self) -> uuid.UUID: ...

    @abstractmethod
    def ensure_partnership_request(
        self, restaurant_id: uuid.UUID, provider_id: uuid.UUID
    ) -> bool: ...

    @abstractmethod
    def list_pending_partnership_requests(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryPartnershipRequestDTO]: ...

    @abstractmethod
    def list_active_partnership_requests(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryPartnershipRequestDTO]: ...

    @abstractmethod
    def accept_partnership_request(
        self, link_id: uuid.UUID, provider_id: uuid.UUID
    ) -> DeliveryPartnershipRequestDTO: ...

    @abstractmethod
    def reject_partnership_request(self, link_id: uuid.UUID, provider_id: uuid.UUID) -> None: ...

    @abstractmethod
    def get_partnership_provider_id(self, link_id: uuid.UUID) -> uuid.UUID | None: ...

    @abstractmethod
    def get_mexy_partnership_for_restaurant(
        self, restaurant_id: uuid.UUID
    ) -> RestaurantDeliveryPartnershipDTO | None: ...
