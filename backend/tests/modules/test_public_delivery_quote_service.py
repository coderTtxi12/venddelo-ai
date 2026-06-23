import uuid
from datetime import UTC, datetime, time
from unittest.mock import MagicMock, patch

from app.modules.delivery_providers.schemas import (
    DeliveryProviderPricingConfigDTO,
    DeliveryProviderScheduleDTO,
    RestaurantDeliveryPartnershipDTO,
)
from app.modules.public.delivery_quote_service import PublicDeliveryQuoteService
from app.modules.restaurants.schemas import RestaurantDTO


def _restaurant(**overrides) -> RestaurantDTO:
    base = {
        "id": uuid.uuid4(),
        "name": "Tacos",
        "subdomain": "tacos",
        "status": "published",
        "takeout_enabled": True,
        "delivery_enabled": True,
        "latitude": 19.4326,
        "longitude": -99.1332,
        "original_language": "es",
        "timezone": "America/Mexico_City",
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    base.update(overrides)
    return RestaurantDTO.model_validate(base)


def test_resolve_delivery_service_blocks_pending_partnership():
    repo = MagicMock()
    partnership = RestaurantDeliveryPartnershipDTO(
        id=uuid.uuid4(),
        provider_name="Mexy",
        provider_slug="mexy",
        status="pending",
        is_default=False,
        created_at=datetime.now(),
        activated_at=None,
    )
    repo.get_mexy_partnership_for_restaurant.return_value = partnership

    service = PublicDeliveryQuoteService(repo)
    resolved = service.resolve_delivery_service(_restaurant())

    assert resolved.available is False
    assert resolved.partnership_status == "pending"
    assert "aceptada" in (resolved.reason or "").lower()


def test_resolve_delivery_service_blocks_when_delivery_disabled():
    repo = MagicMock()
    service = PublicDeliveryQuoteService(repo)
    resolved = service.resolve_delivery_service(_restaurant(delivery_enabled=False))

    assert resolved.available is False
    assert resolved.partnership_status == "none"
