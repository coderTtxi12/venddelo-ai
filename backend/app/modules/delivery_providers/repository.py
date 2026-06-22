from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.modules.delivery_providers.schemas import DeliveryProviderDTO


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
