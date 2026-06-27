from __future__ import annotations

import uuid
from collections.abc import Sequence

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryPartnershipRequestDTO,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderScheduleDTO,
    RestaurantDeliveryPartnershipDTO,
    RestaurantDeliveryPartnershipResponse,
)
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import PaymentMethodCreate, PaymentMethodDTO

_DELIVERY_PAYMENT_METHODS = ("cash", "transfer", "card_terminal")


class DeliveryPartnershipService:
    def __init__(
        self,
        repo: DeliveryProviderRepository,
        *,
        restaurant_repo: RestaurantRepository | None = None,
    ) -> None:
        self._repo = repo
        self._restaurant_repo = restaurant_repo

    def ensure_mexy_request_for_restaurant(self, restaurant_id: uuid.UUID) -> bool:
        if self._repo.get_mexy_partnership_for_restaurant(restaurant_id) is not None:
            return False
        provider_id = self._repo.get_or_create_mexy_provider_id()
        return self._repo.ensure_partnership_request(restaurant_id, provider_id)

    def request_mexy_partnership(
        self, restaurant_id: uuid.UUID, *, delivery_enabled: bool
    ) -> RestaurantDeliveryPartnershipResponse:
        if not delivery_enabled:
            from app.core.exceptions import ValidationError

            raise ValidationError(
                "Habilita entrega a domicilio para solicitar reparto con Mexy"
            )
        self.ensure_mexy_request_for_restaurant(restaurant_id)
        return self.get_mexy_partnership_status(restaurant_id)

    def get_mexy_partnership_status(
        self, restaurant_id: uuid.UUID
    ) -> RestaurantDeliveryPartnershipResponse:
        partnership = self._repo.get_mexy_partnership_for_restaurant(restaurant_id)
        return RestaurantDeliveryPartnershipResponse(partnership=partnership)

    def get_active_provider_schedules(
        self, restaurant_id: uuid.UUID
    ) -> list[DeliveryProviderScheduleDTO]:
        provider_id = self._active_partnership_provider_id(restaurant_id)
        if provider_id is None:
            return []
        rows = list(self._repo.list_schedules(provider_id))
        if not rows:
            self._repo.seed_default_schedules(provider_id)
            rows = list(self._repo.list_schedules(provider_id))
        return rows

    def get_active_provider_payment_methods(
        self, restaurant_id: uuid.UUID
    ) -> list[DeliveryProviderPaymentMethodDTO]:
        provider_id = self._active_partnership_provider_id(restaurant_id)
        if provider_id is None:
            return []
        rows = list(self._repo.list_payment_methods(provider_id))
        if not rows:
            self._repo.seed_default_payment_methods(provider_id)
            rows = list(self._repo.list_payment_methods(provider_id))
        return rows

    def _active_partnership_provider_id(self, restaurant_id: uuid.UUID) -> uuid.UUID | None:
        partnership = self._repo.get_mexy_partnership_for_restaurant(restaurant_id)
        if partnership is None or partnership.status != "active":
            return None
        return self._repo.get_mexy_provider_id()

    def validate_restaurant_payment_methods(
        self,
        restaurant_id: uuid.UUID,
        methods: Sequence[PaymentMethodCreate],
    ) -> None:
        provider_id = self._active_partnership_provider_id(restaurant_id)
        if provider_id is None:
            return

        provider_enabled = {
            pm.method for pm in self.get_active_provider_payment_methods(restaurant_id) if pm.enabled
        }
        for method in methods:
            if (
                method.service_type == "delivery"
                and method.enabled
                and method.method not in provider_enabled
            ):
                raise ValidationError(
                    "El método de pago no está disponible con tu proveedor de reparto"
                )

    def seed_restaurant_delivery_payment_methods(self, restaurant_id: uuid.UUID) -> None:
        if self._restaurant_repo is None:
            return
        if self._active_partnership_provider_id(restaurant_id) is None:
            return

        provider_enabled = {
            pm.method
            for pm in self.get_active_provider_payment_methods(restaurant_id)
            if pm.enabled
        }
        existing = list(self._restaurant_repo.list_payment_methods(restaurant_id))
        takeout_methods = [pm for pm in existing if pm.service_type == "takeout"]

        rows: list[PaymentMethodCreate] = []
        if takeout_methods:
            for pm in takeout_methods:
                rows.append(
                    PaymentMethodCreate(
                        method=pm.method,
                        service_type="takeout",
                        enabled=pm.enabled,
                    )
                )
        else:
            for method in _DELIVERY_PAYMENT_METHODS:
                rows.append(
                    PaymentMethodCreate(method=method, service_type="takeout", enabled=True)
                )

        for method in _DELIVERY_PAYMENT_METHODS:
            rows.append(
                PaymentMethodCreate(
                    method=method,
                    service_type="delivery",
                    enabled=method in provider_enabled,
                )
            )

        self._restaurant_repo.set_payment_methods(restaurant_id, rows)

    def ensure_restaurant_delivery_payment_methods(self, restaurant_id: uuid.UUID) -> None:
        if self._restaurant_repo is None:
            return
        if self._active_partnership_provider_id(restaurant_id) is None:
            return

        existing = list(self._restaurant_repo.list_payment_methods(restaurant_id))
        if any(pm.service_type == "delivery" for pm in existing):
            return

        self.seed_restaurant_delivery_payment_methods(restaurant_id)

    def list_pending_requests(self, user_id: uuid.UUID) -> list[DeliveryPartnershipRequestDTO]:
        self._require_delivery_provider_member(user_id)

        by_restaurant: dict[uuid.UUID, DeliveryPartnershipRequestDTO] = {}
        for provider_id in self._repo.get_mexy_provider_ids():
            for request in self._repo.list_pending_partnership_requests(provider_id):
                restaurant_id = request.restaurant.id
                existing = by_restaurant.get(restaurant_id)
                if existing is None or request.created_at > existing.created_at:
                    by_restaurant[restaurant_id] = request

        return sorted(by_restaurant.values(), key=lambda item: item.created_at, reverse=True)

    def list_active_requests(self, user_id: uuid.UUID) -> list[DeliveryPartnershipRequestDTO]:
        self._require_delivery_provider_member(user_id)

        seen: set[uuid.UUID] = set()
        partnerships: list[DeliveryPartnershipRequestDTO] = []
        for provider_id in self._repo.get_mexy_provider_ids():
            for partnership in self._repo.list_active_partnership_requests(provider_id):
                if partnership.id in seen:
                    continue
                seen.add(partnership.id)
                partnerships.append(partnership)
        return partnerships

    def accept_request(
        self, user_id: uuid.UUID, link_id: uuid.UUID
    ) -> DeliveryPartnershipRequestDTO:
        provider_id = self._require_delivery_provider_mexy_link(user_id, link_id)
        result = self._repo.accept_partnership_request(link_id, provider_id)
        self.seed_restaurant_delivery_payment_methods(result.restaurant.id)
        return result

    def reject_request(self, user_id: uuid.UUID, link_id: uuid.UUID) -> None:
        provider_id = self._require_delivery_provider_mexy_link(user_id, link_id)
        self._repo.reject_partnership_request(link_id, provider_id)

    def _require_delivery_provider_member(self, user_id: uuid.UUID) -> None:
        if self._repo.get_for_user(user_id) is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")

    def _require_delivery_provider_mexy_link(
        self, user_id: uuid.UUID, link_id: uuid.UUID
    ) -> uuid.UUID:
        self._require_delivery_provider_member(user_id)

        provider_id = self._repo.get_partnership_provider_id(link_id)
        if provider_id is None:
            raise NotFoundError("Solicitud de partnership no encontrada")

        allowed = set(self._repo.get_mexy_provider_ids())
        if provider_id not in allowed:
            raise ForbiddenError("No puedes gestionar esta solicitud")
        return provider_id
