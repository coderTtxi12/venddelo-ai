from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.modules.delivery_providers.schemas import DeliveryProviderPaymentMethodDTO
from app.modules.public.checkout_payments import (
    enabled_public_payment_methods,
    is_public_payment_method_enabled,
)
from app.modules.restaurants.schemas import PaymentMethodDTO, RestaurantDTO


def _restaurant(**overrides) -> RestaurantDTO:
    now = datetime.now(UTC)
    base = dict(
        id=uuid.uuid4(),
        name="Test",
        subdomain="test",
        original_language="es",
        status="published",
        owner_id=uuid.uuid4(),
        is_active=True,
        takeout_enabled=True,
        delivery_enabled=True,
        created_at=now,
        updated_at=now,
    )
    base.update(overrides)
    return RestaurantDTO(**base)


def test_delivery_uses_provider_payment_methods_when_partnership_active():
    restaurant = _restaurant()
    restaurant_methods = [
        PaymentMethodDTO(
            id=uuid.uuid4(),
            method="cash",
            service_type="takeout",
            enabled=True,
        ),
    ]
    provider_methods = [
        DeliveryProviderPaymentMethodDTO(id=uuid.uuid4(), method="cash", enabled=True),
        DeliveryProviderPaymentMethodDTO(id=uuid.uuid4(), method="transfer", enabled=False),
    ]

    enabled = enabled_public_payment_methods(
        restaurant,
        restaurant_methods,
        delivery_resolved_available=True,
        provider_methods=provider_methods,
    )

    assert ("cash", "takeout") in enabled
    assert ("cash", "delivery") in enabled
    assert ("transfer", "delivery") not in enabled
    assert is_public_payment_method_enabled(
        restaurant,
        restaurant_methods,
        order_type="delivery",
        payment_method="cash",
        delivery_resolved_available=True,
        provider_methods=provider_methods,
    )


def test_delivery_falls_back_to_restaurant_methods_without_provider():
    restaurant = _restaurant()
    restaurant_methods = [
        PaymentMethodDTO(
            id=uuid.uuid4(),
            method="transfer",
            service_type="delivery",
            enabled=True,
        ),
    ]

    assert is_public_payment_method_enabled(
        restaurant,
        restaurant_methods,
        order_type="delivery",
        payment_method="transfer",
        delivery_resolved_available=True,
        provider_methods=[],
    )
