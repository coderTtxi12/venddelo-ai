from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.core.config import get_settings
from app.infra.maps.google_distance_matrix import DistanceMatrixError, fetch_driving_distance_km
from app.modules.delivery_providers.availability import (
    is_night_schedule,
    is_within_regular_schedule,
    resolve_service_status,
)
from app.modules.delivery_providers.pricing import (
    DeliveryWeatherMode,
    config_from_json,
    quote_delivery_fee,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import RestaurantDeliveryPartnershipDTO
from app.modules.restaurants.schemas import RestaurantDTO

PartnershipStatus = Literal["none", "pending", "active", "suspended"]


@dataclass(frozen=True)
class ResolvedDeliveryService:
    available: bool
    reason: str | None
    partnership_status: PartnershipStatus
    provider_name: str | None
    provider_id: uuid.UUID | None


@dataclass(frozen=True)
class ResolvedDeliveryQuote:
    available: bool
    reason: str | None
    delivery_fee_cents: int
    inside_polygon: bool
    distance_km: float | None
    provider_name: str | None
    partnership_status: PartnershipStatus
    weather_mode: DeliveryWeatherMode = "none"


def _partnership_status(
    partnership: RestaurantDeliveryPartnershipDTO | None,
) -> PartnershipStatus:
    if partnership is None:
        return "none"
    return partnership.status  # type: ignore[return-value]


def _partnership_reason(status: PartnershipStatus) -> str:
    if status == "none":
        return (
            "Este restaurante no tiene un servicio de reparto asociado. "
            "Elige recoger en local."
        )
    if status == "pending":
        return (
            "La solicitud de reparto aún no ha sido aceptada por el courier. "
            "Elige recoger en local o contacta al restaurante."
        )
    if status == "suspended":
        return "El servicio de reparto está suspendido. Elige recoger en local."
    return "El servicio de reparto no está disponible."


def _service_reason(status_reason: str) -> str:
    if status_reason == "manual_off":
        return "El servicio de reparto no está disponible en este momento."
    if status_reason == "outside_schedule":
        return "El servicio de reparto no está disponible en este momento."
    return "El servicio de reparto no está disponible en este momento."


class PublicDeliveryQuoteService:
    def __init__(self, repo: DeliveryProviderRepository) -> None:
        self._repo = repo

    def resolve_delivery_service(
        self,
        restaurant: RestaurantDTO,
        *,
        now: datetime | None = None,
    ) -> ResolvedDeliveryService:
        if not restaurant.delivery_enabled:
            return ResolvedDeliveryService(
                available=False,
                reason="Este restaurante no ofrece entrega a domicilio.",
                partnership_status="none",
                provider_name=None,
                provider_id=None,
            )

        partnership = self._repo.get_mexy_partnership_for_restaurant(restaurant.id)
        status = _partnership_status(partnership)
        if status != "active" or partnership is None:
            return ResolvedDeliveryService(
                available=False,
                reason=_partnership_reason(status),
                partnership_status=status,
                provider_name=partnership.provider_name if partnership else None,
                provider_id=None,
            )

        provider_id = self._repo.get_mexy_provider_id()
        if provider_id is None:
            return ResolvedDeliveryService(
                available=False,
                reason=_partnership_reason("none"),
                partnership_status=status,
                provider_name=partnership.provider_name,
                provider_id=None,
            )

        schedules = list(self._repo.list_schedules(provider_id))
        if not schedules:
            self._repo.seed_default_schedules(provider_id)
            schedules = list(self._repo.list_schedules(provider_id))

        timezone = self._repo.get_provider_timezone(provider_id)
        service_status = resolve_service_status(
            manually_enabled=self._repo.get_service_manually_enabled(provider_id),
            schedules=schedules,
            timezone=timezone,
            now=now,
        )
        if not service_status.service_active:
            return ResolvedDeliveryService(
                available=False,
                reason=_service_reason(service_status.status_reason),
                partnership_status=status,
                provider_name=partnership.provider_name,
                provider_id=provider_id,
            )

        if restaurant.latitude is None or restaurant.longitude is None:
            return ResolvedDeliveryService(
                available=False,
                reason="El restaurante no tiene ubicación configurada para calcular entregas.",
                partnership_status=status,
                provider_name=partnership.provider_name,
                provider_id=provider_id,
            )

        return ResolvedDeliveryService(
            available=True,
            reason=None,
            partnership_status=status,
            provider_name=partnership.provider_name,
            provider_id=provider_id,
        )

    def quote_delivery(
        self,
        restaurant: RestaurantDTO,
        *,
        delivery_latitude: float,
        delivery_longitude: float,
        now: datetime | None = None,
    ) -> ResolvedDeliveryQuote:
        quote_now = now or datetime.now(UTC)
        service = self.resolve_delivery_service(restaurant, now=quote_now)
        partnership = self._repo.get_mexy_partnership_for_restaurant(restaurant.id)
        status = _partnership_status(partnership)
        provider_name = partnership.provider_name if partnership else None

        if not service.available or service.provider_id is None:
            return ResolvedDeliveryQuote(
                available=False,
                reason=service.reason,
                delivery_fee_cents=0,
                inside_polygon=False,
                distance_km=None,
                provider_name=provider_name,
                partnership_status=status,
            )

        provider_id = service.provider_id
        weather_mode: DeliveryWeatherMode = self._repo.get_weather_mode(provider_id)  # type: ignore[assignment]
        if restaurant.latitude is None or restaurant.longitude is None:
            return ResolvedDeliveryQuote(
                available=False,
                reason="El restaurante no tiene ubicación configurada para calcular entregas.",
                delivery_fee_cents=0,
                inside_polygon=False,
                distance_km=None,
                provider_name=provider_name,
                partnership_status=status,
                weather_mode=weather_mode,
            )

        inside_polygon = self._repo.point_in_primary_zone(
            provider_id,
            delivery_latitude,
            delivery_longitude,
        )

        distance_km: float | None = None
        if not inside_polygon:
            api_key = get_settings().google_maps_api_key
            if not api_key:
                return ResolvedDeliveryQuote(
                    available=False,
                    reason=(
                        "No se pudo validar la cobertura de entrega para esta dirección. "
                        "Intenta más tarde."
                    ),
                    delivery_fee_cents=0,
                    inside_polygon=False,
                    distance_km=None,
                    provider_name=provider_name,
                    partnership_status=status,
                    weather_mode=weather_mode,
                )
            try:
                distance_km = fetch_driving_distance_km(
                    origin_lat=restaurant.latitude,
                    origin_lng=restaurant.longitude,
                    destination_lat=delivery_latitude,
                    destination_lng=delivery_longitude,
                    api_key=api_key,
                )
            except DistanceMatrixError:
                return ResolvedDeliveryQuote(
                    available=False,
                    reason="No se pudo calcular la ruta hacia esta dirección.",
                    delivery_fee_cents=0,
                    inside_polygon=False,
                    distance_km=None,
                    provider_name=provider_name,
                    partnership_status=status,
                    weather_mode=weather_mode,
                )

        pricing_dto = self._repo.get_pricing_config(provider_id)
        if pricing_dto is None:
            self._repo.seed_default_pricing_config(provider_id)
            pricing_dto = self._repo.get_pricing_config(provider_id)
        if pricing_dto is None:
            return ResolvedDeliveryQuote(
                available=False,
                reason="No se encontró configuración de tarifas del repartidor.",
                delivery_fee_cents=0,
                inside_polygon=inside_polygon,
                distance_km=distance_km,
                provider_name=provider_name,
                partnership_status=status,
                weather_mode=weather_mode,
            )

        parsed = config_from_json(
            {
                "inside_polygon": pricing_dto.inside_polygon.model_dump(),
                "outside_polygon": pricing_dto.outside_polygon.model_dump(),
            }
        )

        schedules = list(self._repo.list_schedules(provider_id))
        timezone = self._repo.get_provider_timezone(provider_id)

        if not inside_polygon and not is_within_regular_schedule(
            schedules, timezone=timezone, now=quote_now
        ):
            return ResolvedDeliveryQuote(
                available=False,
                reason=(
                    "Las entregas fuera de cobertura solo están disponibles "
                    "en horario diurno."
                ),
                delivery_fee_cents=0,
                inside_polygon=False,
                distance_km=distance_km,
                provider_name=provider_name,
                partnership_status=status,
                weather_mode=weather_mode,
            )

        is_night = (
            is_night_schedule(schedules, timezone=timezone, now=quote_now)
            if inside_polygon
            else False
        )

        quote = quote_delivery_fee(
            parsed,
            inside_polygon=inside_polygon,
            distance_km=distance_km,
            is_night=is_night,
            weather_mode=weather_mode,
        )

        return ResolvedDeliveryQuote(
            available=quote.available,
            reason=quote.reason,
            delivery_fee_cents=quote.restaurant_cents if quote.available else 0,
            inside_polygon=inside_polygon,
            distance_km=distance_km if not inside_polygon else distance_km,
            provider_name=provider_name,
            partnership_status=status,
            weather_mode=weather_mode,
        )
