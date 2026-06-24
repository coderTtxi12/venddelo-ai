from __future__ import annotations

from collections.abc import Sequence

from app.modules.delivery_providers.schemas import DeliveryProviderPaymentMethodDTO
from app.modules.restaurants.schemas import PaymentMethodDTO, RestaurantDTO


def enabled_public_payment_methods(
    restaurant: RestaurantDTO,
    restaurant_methods: Sequence[PaymentMethodDTO],
    *,
    delivery_resolved_available: bool,
    provider_methods: Sequence[DeliveryProviderPaymentMethodDTO],
) -> list[tuple[str, str]]:
    """Enabled (method, service_type) pairs exposed on the public checkout."""
    enabled: list[tuple[str, str]] = []

    if restaurant.takeout_enabled:
        for pm in restaurant_methods:
            if pm.service_type == "takeout" and pm.enabled:
                enabled.append((pm.method, "takeout"))

    if restaurant.delivery_enabled and delivery_resolved_available:
        if provider_methods:
            for pm in provider_methods:
                if pm.enabled:
                    enabled.append((pm.method, "delivery"))
        else:
            for pm in restaurant_methods:
                if pm.service_type == "delivery" and pm.enabled:
                    enabled.append((pm.method, "delivery"))

    return enabled


def is_public_payment_method_enabled(
    restaurant: RestaurantDTO,
    restaurant_methods: Sequence[PaymentMethodDTO],
    *,
    order_type: str,
    payment_method: str,
    delivery_resolved_available: bool,
    provider_methods: Sequence[DeliveryProviderPaymentMethodDTO],
) -> bool:
    return any(
        method == payment_method and service_type == order_type
        for method, service_type in enabled_public_payment_methods(
            restaurant,
            restaurant_methods,
            delivery_resolved_available=delivery_resolved_available,
            provider_methods=provider_methods,
        )
    )
