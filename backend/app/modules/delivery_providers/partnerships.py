from __future__ import annotations

import uuid
from collections.abc import Sequence

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT
from app.infra.realtime.restaurant_dispatch_hub import (
    notify_restaurants_delivery_service_updated,
)
from app.modules.delivery_providers.matching import match_mexy_zone
from app.modules.delivery_providers.permissions import require_manage_partnerships
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryPartnershipListDTO,
    DeliveryPartnershipRequestDTO,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderScheduleDTO,
    MexyCoverageResponse,
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
        if self._restaurant_repo is None:
            return False

        restaurant = self._restaurant_repo.get(restaurant_id)
        if (
            restaurant is None
            or restaurant.latitude is None
            or restaurant.longitude is None
        ):
            return False

        matched = match_mexy_zone(
            self._repo.list_mexy_zone_match_candidates(
                restaurant.latitude,
                restaurant.longitude,
            )
        )
        if matched is None:
            return False

        _zone, _distance_km, provider_id, zone_id = matched
        return self._repo.ensure_partnership_request(restaurant_id, provider_id, zone_id)

    def get_mexy_coverage(
        self, latitude: float, longitude: float
    ) -> MexyCoverageResponse:
        matched = match_mexy_zone(
            self._repo.list_mexy_zone_match_candidates(latitude, longitude)
        )
        if matched is None:
            return MexyCoverageResponse(zone=None, distance_km=None)
        zone, distance_km, _provider_id, _zone_id = matched
        return MexyCoverageResponse(zone=zone, distance_km=distance_km)

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
        partnership = self._repo.get_mexy_partnership_for_restaurant(restaurant_id)
        if partnership is None or partnership.status != "active":
            return []
        zone_id = partnership.zone_id
        if zone_id is None:
            return []
        rows = list(self._repo.list_schedules(zone_id))
        if not rows:
            provider_id = self._repo.get_mexy_provider_id()
            if provider_id is not None:
                self._repo.seed_default_schedules(provider_id, zone_id)
            rows = list(self._repo.list_schedules(zone_id))
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

    def list_pending_requests(
        self,
        user_id: uuid.UUID,
        zone_id: uuid.UUID | None = None,
        *,
        q: str | None = None,
        has_web_app: bool | None = None,
        on_hold: bool | None = None,
        sort: str | None = None,
        limit: int = DEFAULT_LIMIT,
        offset: int = 0,
    ) -> DeliveryPartnershipListDTO:
        self._require_delivery_provider_member(user_id)
        return self._list_page(
            status="pending",
            zone_id=zone_id,
            q=q,
            has_web_app=has_web_app,
            on_hold=on_hold,
            sort=sort or "-created_at",
            limit=limit,
            offset=offset,
        )

    def list_active_requests(
        self,
        user_id: uuid.UUID,
        zone_id: uuid.UUID | None = None,
        *,
        q: str | None = None,
        has_web_app: bool | None = None,
        on_hold: bool | None = None,
        sort: str | None = None,
        limit: int = DEFAULT_LIMIT,
        offset: int = 0,
    ) -> DeliveryPartnershipListDTO:
        self._require_delivery_provider_member(user_id)
        return self._list_page(
            status="active",
            zone_id=zone_id,
            q=q,
            has_web_app=has_web_app,
            on_hold=on_hold,
            sort=sort or "-activated_at",
            limit=limit,
            offset=offset,
        )

    def _list_page(
        self,
        *,
        status: str,
        zone_id: uuid.UUID | None,
        q: str | None,
        has_web_app: bool | None,
        on_hold: bool | None,
        sort: str,
        limit: int,
        offset: int,
    ) -> DeliveryPartnershipListDTO:
        page_limit = min(max(1, limit), MAX_LIMIT)
        page_offset = max(0, offset)
        items, total = self._repo.list_partnerships_page(
            self._repo.get_mexy_provider_ids(),
            status=status,
            zone_id=zone_id,
            q=q,
            has_web_app=has_web_app,
            on_hold=on_hold,
            sort=sort,
            limit=page_limit,
            offset=page_offset,
        )
        return DeliveryPartnershipListDTO(
            items=list(items),
            total=total,
            has_more=page_offset + len(items) < total,
        )

    def accept_request(
        self, user_id: uuid.UUID, link_id: uuid.UUID
    ) -> DeliveryPartnershipRequestDTO:
        self._require_partnership_manager(user_id)
        provider_id = self._require_delivery_provider_mexy_link(user_id, link_id)
        result = self._repo.accept_partnership_request(link_id, provider_id)
        self.seed_restaurant_delivery_payment_methods(result.restaurant.id)
        return result

    def reject_request(self, user_id: uuid.UUID, link_id: uuid.UUID) -> None:
        self._require_partnership_manager(user_id)
        provider_id = self._require_delivery_provider_mexy_link(user_id, link_id)
        self._repo.reject_partnership_request(link_id, provider_id)

    def reassign_zone(
        self, user_id: uuid.UUID, link_id: uuid.UUID, zone_id: uuid.UUID
    ) -> DeliveryPartnershipRequestDTO:
        return self.update_partnership(user_id, link_id, zone_id=zone_id)

    def update_partnership(
        self,
        user_id: uuid.UUID,
        link_id: uuid.UUID,
        *,
        zone_id: uuid.UUID | None = None,
        has_web_app: bool | None = None,
        on_hold: bool | None = None,
    ) -> DeliveryPartnershipRequestDTO:
        self._require_partnership_manager(user_id)
        provider_id = self._require_delivery_provider_mexy_link(user_id, link_id)
        result = self._repo.update_partnership(
            link_id,
            provider_id,
            zone_id=zone_id,
            has_web_app=has_web_app,
            on_hold=on_hold,
        )
        if on_hold is not None:
            notify_restaurants_delivery_service_updated([result.restaurant.id])
        return result

    def _require_delivery_provider_member(self, user_id: uuid.UUID) -> str:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")
        _provider, member_role = found
        return member_role

    def _require_partnership_manager(self, user_id: uuid.UUID) -> None:
        member_role = self._require_delivery_provider_member(user_id)
        require_manage_partnerships(member_role)

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
