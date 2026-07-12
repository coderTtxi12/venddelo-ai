from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, time

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.db.models.delivery import (
    DeliveryProvider,
    DeliveryProviderAdminInvite,
    DeliveryProviderMember,
    DeliveryProviderPaymentMethod,
    DeliveryProviderPricingConfig,
    DeliveryProviderSchedule,
    DeliveryProviderZone,
    RestaurantDeliveryProvider,
)
from app.db.models.restaurant import Restaurant
from app.db.models.user import User
from app.modules.delivery_providers.constants import (
    MEXY_LEGACY_SLUG,
    MEXY_PROVIDER_NAME,
    MEXY_PROVIDER_SLUG,
    MEXY_PROVIDER_SLUG_PREFIX,
    is_mexy_provider_slug,
)
from app.modules.delivery_providers.pricing import (
    config_from_json,
    config_to_json,
    default_pricing_config,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryPartnershipRequestDTO,
    DeliveryPartnershipRestaurantDTO,
    DeliveryProviderAdminInviteDTO,
    DeliveryProviderDTO,
    DeliveryProviderMemberDTO,
    DeliveryProviderPricingConfigDTO,
    DeliveryProviderPaymentMethodCreate,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderZoneDTO,
    GeoJsonPolygon,
    InsidePolygonTariffsDTO,
    InsideWeatherTariffsDTO,
    OutsidePolygonTariffsDTO,
    OutsideTariffBracketDTO,
    RestaurantDeliveryPartnershipDTO,
)

DEFAULT_SCHEDULE_ROWS: tuple[tuple[str, time, time], ...] = (
    ("regular", time(9, 0), time(21, 0)),
    ("night", time(21, 0), time(22, 0)),
)

DEFAULT_PAYMENT_METHODS: tuple[str, ...] = ("cash", "transfer", "card_terminal")


class SqlAlchemyDeliveryProviderRepository(DeliveryProviderRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_for_user(self, user_id: uuid.UUID) -> tuple[DeliveryProviderDTO, str] | None:
        row = self._session.execute(
            select(DeliveryProvider, DeliveryProviderMember.member_role)
            .join(
                DeliveryProviderMember,
                DeliveryProviderMember.delivery_provider_id == DeliveryProvider.id,
            )
            .where(
                DeliveryProviderMember.user_id == user_id,
                DeliveryProviderMember.is_active.is_(True),
            )
            .order_by(DeliveryProvider.created_at.desc())
            .limit(1)
        ).first()
        if row is None:
            return None
        provider, member_role = row
        return DeliveryProviderDTO.model_validate(provider), member_role

    def slug_exists(self, slug: str) -> bool:
        found = self._session.scalar(
            select(DeliveryProvider.id).where(DeliveryProvider.slug == slug).limit(1)
        )
        return found is not None

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
    ) -> DeliveryProviderDTO:
        now = datetime.now(UTC)
        provider = DeliveryProvider(
            name=company_name,
            slug=slug,
            responsible_name=responsible_name,
            responsible_phone=responsible_phone,
            whatsapp_phone=whatsapp_phone,
            contact_phone=whatsapp_phone,
            logo_path=logo_path,
            status="pending_review",
            submitted_at=now,
        )
        self._session.add(provider)
        self._session.flush()

        member = DeliveryProviderMember(
            delivery_provider_id=provider.id,
            user_id=user_id,
            member_role="owner",
            is_active=True,
        )
        self._session.add(member)

        zone = DeliveryProviderZone(
            delivery_provider_id=provider.id,
            name=zone_name,
            zone_kind="polygon",
            is_active=True,
            priority=0,
        )
        self._session.add(zone)
        self._session.flush()

        self._session.execute(
            text(
                """
                UPDATE delivery_provider_zones
                SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)::geography
                WHERE id = :zone_id
                """
            ),
            {"geojson": zone_geojson, "zone_id": str(zone.id)},
        )
        self._session.flush()
        self._session.refresh(provider)
        self.seed_default_schedules(provider.id)
        self.seed_default_pricing_config(provider.id)
        self.seed_default_payment_methods(provider.id)
        return DeliveryProviderDTO.model_validate(provider)

    def set_logo_path(self, provider_id: uuid.UUID, logo_path: str) -> None:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            return
        provider.logo_path = logo_path
        self._session.flush()

    def get_primary_zone(self, provider_id: uuid.UUID) -> DeliveryProviderZoneDTO | None:
        row = (
            self._session.execute(
                text(
                    """
                    SELECT id, name, center_lat, center_lng,
                           ST_AsGeoJSON(boundary::geometry) AS boundary_geojson
                    FROM delivery_provider_zones
                    WHERE delivery_provider_id = :provider_id AND is_active = true
                    ORDER BY priority ASC, created_at ASC
                    LIMIT 1
                    """
                ),
                {"provider_id": str(provider_id)},
            )
            .mappings()
            .first()
        )
        if row is None:
            return None

        polygon: GeoJsonPolygon | None = None
        raw_geojson = row["boundary_geojson"]
        if raw_geojson:
            geo = json.loads(raw_geojson)
            if geo.get("type") == "Polygon" and geo.get("coordinates"):
                polygon = GeoJsonPolygon(
                    type="Polygon",
                    coordinates=geo["coordinates"],
                )

        return DeliveryProviderZoneDTO(
            id=row["id"],
            name=row["name"],
            polygon=polygon,
            center_lat=row["center_lat"],
            center_lng=row["center_lng"],
        )

    def point_in_primary_zone(
        self, provider_id: uuid.UUID, latitude: float, longitude: float
    ) -> bool:
        row = (
            self._session.execute(
                text(
                    """
                    SELECT ST_Contains(
                        boundary::geometry,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
                    ) AS inside
                    FROM delivery_provider_zones
                    WHERE delivery_provider_id = :provider_id
                      AND is_active = true
                      AND boundary IS NOT NULL
                    ORDER BY priority ASC, created_at ASC
                    LIMIT 1
                    """
                ),
                {
                    "provider_id": str(provider_id),
                    "lat": latitude,
                    "lng": longitude,
                },
            )
            .mappings()
            .first()
        )
        if row is None:
            return False
        return bool(row["inside"])

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
    ) -> DeliveryProviderDTO:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")

        provider.name = company_name
        provider.responsible_name = responsible_name
        provider.responsible_phone = responsible_phone
        provider.whatsapp_phone = whatsapp_phone
        provider.contact_phone = whatsapp_phone
        if logo_path is not None:
            provider.logo_path = logo_path

        zone = self._session.scalar(
            select(DeliveryProviderZone)
            .where(
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
            .order_by(DeliveryProviderZone.priority.asc(), DeliveryProviderZone.created_at.asc())
            .limit(1)
        )
        if zone is None:
            zone = DeliveryProviderZone(
                delivery_provider_id=provider_id,
                name=zone_name,
                zone_kind="polygon",
                is_active=True,
                priority=0,
            )
            self._session.add(zone)
            self._session.flush()
        else:
            zone.name = zone_name
            zone.center_lat = center_lat
            zone.center_lng = center_lng

        self._session.execute(
            text(
                """
                UPDATE delivery_provider_zones
                SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)::geography,
                    center_lat = :center_lat,
                    center_lng = :center_lng,
                    name = :zone_name
                WHERE id = :zone_id
                """
            ),
            {
                "geojson": zone_geojson,
                "zone_id": str(zone.id),
                "center_lat": center_lat,
                "center_lng": center_lng,
                "zone_name": zone_name,
            },
        )
        self._session.flush()
        self._session.refresh(provider)
        return DeliveryProviderDTO.model_validate(provider)

    def list_schedules(self, provider_id: uuid.UUID) -> Sequence[DeliveryProviderScheduleDTO]:
        rows = self._session.scalars(
            select(DeliveryProviderSchedule)
            .where(DeliveryProviderSchedule.delivery_provider_id == provider_id)
            .order_by(
                DeliveryProviderSchedule.schedule_kind.asc(),
                DeliveryProviderSchedule.day_of_week.asc(),
                DeliveryProviderSchedule.opens_at.asc(),
            )
        ).all()
        return [DeliveryProviderScheduleDTO.model_validate(row) for row in rows]

    def set_schedules(
        self,
        provider_id: uuid.UUID,
        schedules: Sequence[DeliveryProviderScheduleCreate],
    ) -> None:
        self._session.query(DeliveryProviderSchedule).filter_by(
            delivery_provider_id=provider_id
        ).delete()
        for entry in schedules:
            self._session.add(
                DeliveryProviderSchedule(
                    delivery_provider_id=provider_id,
                    schedule_kind=entry.schedule_kind,
                    day_of_week=entry.day_of_week,
                    opens_at=entry.opens_at,
                    closes_at=entry.closes_at,
                )
            )
        self._session.flush()

    def seed_default_schedules(self, provider_id: uuid.UUID) -> None:
        existing = self._session.scalar(
            select(DeliveryProviderSchedule.id)
            .where(DeliveryProviderSchedule.delivery_provider_id == provider_id)
            .limit(1)
        )
        if existing is not None:
            return

        for day_of_week in range(7):
            for schedule_kind, opens_at, closes_at in DEFAULT_SCHEDULE_ROWS:
                self._session.add(
                    DeliveryProviderSchedule(
                        delivery_provider_id=provider_id,
                        schedule_kind=schedule_kind,
                        day_of_week=day_of_week,
                        opens_at=opens_at,
                        closes_at=closes_at,
                    )
                )
        self._session.flush()

    def get_service_manually_enabled(self, provider_id: uuid.UUID) -> bool:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")
        return provider.service_manually_enabled

    def set_service_manually_enabled(self, provider_id: uuid.UUID, enabled: bool) -> bool:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")
        provider.service_manually_enabled = enabled
        self._session.flush()
        return provider.service_manually_enabled

    def get_provider_timezone(self, provider_id: uuid.UUID) -> str:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")
        return provider.timezone

    def get_pricing_config(self, provider_id: uuid.UUID) -> DeliveryProviderPricingConfigDTO | None:
        row = self._session.scalar(
            select(DeliveryProviderPricingConfig).where(
                DeliveryProviderPricingConfig.delivery_provider_id == provider_id
            )
        )
        if row is None:
            return None
        return self._pricing_dto_from_row(row)

    def set_pricing_config(
        self, provider_id: uuid.UUID, config: DeliveryProviderPricingConfigDTO
    ) -> DeliveryProviderPricingConfigDTO:
        row = self._session.scalar(
            select(DeliveryProviderPricingConfig).where(
                DeliveryProviderPricingConfig.delivery_provider_id == provider_id
            )
        )
        payload = config_to_json(self._pricing_config_from_dto(config))
        if row is None:
            row = DeliveryProviderPricingConfig(
                delivery_provider_id=provider_id,
                inside_polygon=payload["inside_polygon"],  # type: ignore[arg-type]
                outside_polygon=payload["outside_polygon"],  # type: ignore[arg-type]
            )
            self._session.add(row)
        else:
            row.inside_polygon = payload["inside_polygon"]  # type: ignore[assignment]
            row.outside_polygon = payload["outside_polygon"]  # type: ignore[assignment]
        self._session.flush()
        return self._pricing_dto_from_row(row)

    def seed_default_pricing_config(self, provider_id: uuid.UUID) -> None:
        existing = self._session.scalar(
            select(DeliveryProviderPricingConfig.id).where(
                DeliveryProviderPricingConfig.delivery_provider_id == provider_id
            )
        )
        if existing is not None:
            return

        defaults = default_pricing_config()
        payload = config_to_json(defaults)
        self._session.add(
            DeliveryProviderPricingConfig(
                delivery_provider_id=provider_id,
                inside_polygon=payload["inside_polygon"],  # type: ignore[arg-type]
                outside_polygon=payload["outside_polygon"],  # type: ignore[arg-type]
            )
        )
        self._session.flush()

    def list_payment_methods(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryProviderPaymentMethodDTO]:
        rows = self._session.scalars(
            select(DeliveryProviderPaymentMethod)
            .where(DeliveryProviderPaymentMethod.delivery_provider_id == provider_id)
            .order_by(DeliveryProviderPaymentMethod.method.asc())
        )
        return [DeliveryProviderPaymentMethodDTO.model_validate(row) for row in rows]

    def set_payment_methods(
        self,
        provider_id: uuid.UUID,
        methods: Sequence[DeliveryProviderPaymentMethodCreate],
    ) -> None:
        self._session.query(DeliveryProviderPaymentMethod).filter_by(
            delivery_provider_id=provider_id
        ).delete()
        for entry in methods:
            self._session.add(
                DeliveryProviderPaymentMethod(
                    delivery_provider_id=provider_id,
                    method=entry.method,
                    enabled=entry.enabled,
                )
            )
        self._session.flush()

    def seed_default_payment_methods(self, provider_id: uuid.UUID) -> None:
        existing = self._session.scalar(
            select(DeliveryProviderPaymentMethod.id)
            .where(DeliveryProviderPaymentMethod.delivery_provider_id == provider_id)
            .limit(1)
        )
        if existing is not None:
            return

        for method in DEFAULT_PAYMENT_METHODS:
            self._session.add(
                DeliveryProviderPaymentMethod(
                    delivery_provider_id=provider_id,
                    method=method,
                    enabled=True,
                )
            )
        self._session.flush()

    def get_weather_mode(self, provider_id: uuid.UUID) -> str:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")
        return provider.weather_mode

    def set_weather_mode(self, provider_id: uuid.UUID, weather_mode: str) -> str:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")
        provider.weather_mode = weather_mode
        self._session.flush()
        return provider.weather_mode

    @staticmethod
    def _pricing_config_from_dto(config: DeliveryProviderPricingConfigDTO):
        return config_from_json(
            {
                "inside_polygon": config.inside_polygon.model_dump(),
                "outside_polygon": config.outside_polygon.model_dump(),
            }
        )

    @staticmethod
    def _pricing_dto_from_row(row: DeliveryProviderPricingConfig) -> DeliveryProviderPricingConfigDTO:
        parsed = config_from_json(
            {
                "inside_polygon": row.inside_polygon,
                "outside_polygon": row.outside_polygon,
            }
        )
        return DeliveryProviderPricingConfigDTO(
            inside_polygon=InsidePolygonTariffsDTO(
                none=InsideWeatherTariffsDTO(
                    day_cents=parsed.inside_polygon.none.day_cents,
                    night_cents=parsed.inside_polygon.none.night_cents,
                ),
                light=InsideWeatherTariffsDTO(
                    day_cents=parsed.inside_polygon.light.day_cents,
                    night_cents=parsed.inside_polygon.light.night_cents,
                ),
                heavy=InsideWeatherTariffsDTO(
                    day_cents=parsed.inside_polygon.heavy.day_cents,
                    night_cents=parsed.inside_polygon.heavy.night_cents,
                ),
            ),
            outside_polygon=OutsidePolygonTariffsDTO(
                max_distance_km=parsed.outside_polygon.max_distance_km,
                brackets=[
                    OutsideTariffBracketDTO(
                        min_km=bracket.min_km,
                        max_km=bracket.max_km,
                        repa_cents=bracket.repa_cents,
                        mexy_cents=bracket.mexy_cents,
                        restaurant_cents=bracket.restaurant_cents,
                        rain_light_cents=bracket.rain_light_cents,
                        rain_heavy_cents=bracket.rain_heavy_cents,
                    )
                    for bracket in parsed.outside_polygon.brackets
                ],
            ),
        )

    def _mexy_slug_clause(self):
        return or_(
            DeliveryProvider.slug == MEXY_LEGACY_SLUG,
            DeliveryProvider.slug.startswith(MEXY_PROVIDER_SLUG_PREFIX),
        )

    def get_mexy_provider_id(self) -> uuid.UUID | None:
        operational = self._session.scalar(
            select(DeliveryProvider.id)
            .join(
                DeliveryProviderMember,
                DeliveryProviderMember.delivery_provider_id == DeliveryProvider.id,
            )
            .where(
                DeliveryProviderMember.is_active.is_(True),
                self._mexy_slug_clause(),
            )
            .order_by(DeliveryProvider.created_at.desc())
            .limit(1)
        )
        if operational is not None:
            return operational

        exact = self._session.scalar(
            select(DeliveryProvider.id).where(DeliveryProvider.slug == MEXY_PROVIDER_SLUG).limit(1)
        )
        if exact is not None:
            return exact
        return self._session.scalar(
            select(DeliveryProvider.id)
            .where(self._mexy_slug_clause())
            .order_by(DeliveryProvider.created_at.asc())
            .limit(1)
        )

    def get_mexy_provider_ids(self) -> Sequence[uuid.UUID]:
        rows = self._session.scalars(
            select(DeliveryProvider.id)
            .where(self._mexy_slug_clause())
            .order_by(DeliveryProvider.created_at.asc())
        ).all()
        return list(rows)

    def user_is_mexy_courier(self, user_id: uuid.UUID) -> bool:
        member_id = self._session.scalar(
            select(DeliveryProviderMember.id)
            .join(
                DeliveryProvider,
                DeliveryProvider.id == DeliveryProviderMember.delivery_provider_id,
            )
            .where(
                DeliveryProviderMember.user_id == user_id,
                DeliveryProviderMember.is_active.is_(True),
                self._mexy_slug_clause(),
            )
            .limit(1)
        )
        return member_id is not None

    def get_or_create_mexy_provider_id(self) -> uuid.UUID:
        provider_id = self.get_mexy_provider_id()
        if provider_id is not None:
            return provider_id

        provider = DeliveryProvider(
            name=MEXY_PROVIDER_NAME,
            legal_name=MEXY_PROVIDER_NAME,
            slug=MEXY_PROVIDER_SLUG,
            status="active",
            timezone="America/Mexico_City",
            service_manually_enabled=True,
        )
        self._session.add(provider)
        self._session.flush()
        self.seed_default_schedules(provider.id)
        self.seed_default_pricing_config(provider.id)
        self.seed_default_payment_methods(provider.id)
        return provider.id

    def ensure_partnership_request(
        self, restaurant_id: uuid.UUID, provider_id: uuid.UUID
    ) -> bool:
        existing = self._session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.restaurant_id == restaurant_id,
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
            )
        )
        if existing is not None:
            return False

        link = RestaurantDeliveryProvider(
            restaurant_id=restaurant_id,
            delivery_provider_id=provider_id,
            status="pending",
            is_default=False,
        )
        self._session.add(link)
        self._session.flush()
        return True

    def list_pending_partnership_requests(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryPartnershipRequestDTO]:
        rows = self._session.execute(
            select(RestaurantDeliveryProvider, Restaurant, User.display_name)
            .join(Restaurant, Restaurant.id == RestaurantDeliveryProvider.restaurant_id)
            .outerjoin(User, User.id == Restaurant.owner_id)
            .where(
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
                RestaurantDeliveryProvider.status == "pending",
                Restaurant.is_active.is_(True),
            )
            .order_by(RestaurantDeliveryProvider.created_at.desc())
        ).all()
        return [
            self._partnership_dto_from_row(link, restaurant, owner_display_name)
            for link, restaurant, owner_display_name in rows
        ]

    def list_active_partnership_requests(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryPartnershipRequestDTO]:
        rows = self._session.execute(
            select(RestaurantDeliveryProvider, Restaurant, User.display_name)
            .join(Restaurant, Restaurant.id == RestaurantDeliveryProvider.restaurant_id)
            .outerjoin(User, User.id == Restaurant.owner_id)
            .where(
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
                RestaurantDeliveryProvider.status == "active",
                Restaurant.is_active.is_(True),
            )
            .order_by(
                RestaurantDeliveryProvider.activated_at.desc().nullslast(),
                RestaurantDeliveryProvider.created_at.desc(),
            )
        ).all()
        return [
            self._partnership_dto_from_row(link, restaurant, owner_display_name)
            for link, restaurant, owner_display_name in rows
        ]

    def accept_partnership_request(
        self, link_id: uuid.UUID, provider_id: uuid.UUID
    ) -> DeliveryPartnershipRequestDTO:
        from app.core.exceptions import NotFoundError, ValidationError

        row = self._session.execute(
            select(RestaurantDeliveryProvider, Restaurant, User.display_name)
            .join(Restaurant, Restaurant.id == RestaurantDeliveryProvider.restaurant_id)
            .outerjoin(User, User.id == Restaurant.owner_id)
            .where(
                RestaurantDeliveryProvider.id == link_id,
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
            )
        ).first()
        if row is None:
            raise NotFoundError("Solicitud de partnership no encontrada")

        link, restaurant, owner_display_name = row
        if link.status != "pending":
            raise ValidationError("Esta solicitud ya fue procesada")

        self._resolve_duplicate_mexy_partnerships_before_accept(
            restaurant_id=link.restaurant_id,
            keep_link_id=link.id,
        )

        now = datetime.now(UTC)
        link.status = "active"
        link.is_default = True
        link.activated_at = now
        self._session.flush()
        return self._partnership_dto_from_row(link, restaurant, owner_display_name)

    def _resolve_duplicate_mexy_partnerships_before_accept(
        self,
        *,
        restaurant_id: uuid.UUID,
        keep_link_id: uuid.UUID,
    ) -> None:
        siblings = self._session.scalars(
            select(RestaurantDeliveryProvider)
            .join(
                DeliveryProvider,
                DeliveryProvider.id == RestaurantDeliveryProvider.delivery_provider_id,
            )
            .where(
                RestaurantDeliveryProvider.restaurant_id == restaurant_id,
                RestaurantDeliveryProvider.id != keep_link_id,
                self._mexy_slug_clause(),
            )
        ).all()

        for sibling in siblings:
            if sibling.status == "pending":
                self._session.delete(sibling)
            elif sibling.status == "active":
                sibling.is_default = False
                sibling.status = "suspended"

    def reject_partnership_request(self, link_id: uuid.UUID, provider_id: uuid.UUID) -> None:
        from app.core.exceptions import NotFoundError, ValidationError

        link = self._session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.id == link_id,
                RestaurantDeliveryProvider.delivery_provider_id == provider_id,
            )
        )
        if link is None:
            raise NotFoundError("Solicitud de partnership no encontrada")
        if link.status != "pending":
            raise ValidationError("Esta solicitud ya fue procesada")
        self._session.delete(link)
        self._session.flush()

    def get_partnership_provider_id(self, link_id: uuid.UUID) -> uuid.UUID | None:
        return self._session.scalar(
            select(RestaurantDeliveryProvider.delivery_provider_id).where(
                RestaurantDeliveryProvider.id == link_id
            )
        )

    def get_mexy_partnership_for_restaurant(
        self, restaurant_id: uuid.UUID
    ) -> RestaurantDeliveryPartnershipDTO | None:
        row = self._session.execute(
            select(RestaurantDeliveryProvider, DeliveryProvider)
            .join(
                DeliveryProvider,
                DeliveryProvider.id == RestaurantDeliveryProvider.delivery_provider_id,
            )
            .where(
                RestaurantDeliveryProvider.restaurant_id == restaurant_id,
                self._mexy_slug_clause(),
            )
            .order_by(RestaurantDeliveryProvider.created_at.desc())
            .limit(1)
        ).first()
        if row is None:
            return None

        link, provider = row
        if not is_mexy_provider_slug(provider.slug):
            return None

        return RestaurantDeliveryPartnershipDTO(
            id=link.id,
            provider_name=provider.name,
            provider_slug=provider.slug,
            status=link.status,  # type: ignore[arg-type]
            is_default=link.is_default,
            created_at=link.created_at,
            activated_at=link.activated_at,
        )

    @staticmethod
    def _partnership_dto_from_row(
        link: RestaurantDeliveryProvider,
        restaurant: Restaurant,
        owner_display_name: str | None = None,
    ) -> DeliveryPartnershipRequestDTO:
        return DeliveryPartnershipRequestDTO(
            id=link.id,
            status=link.status,
            is_default=link.is_default,
            created_at=link.created_at,
            activated_at=link.activated_at,
            restaurant=DeliveryPartnershipRestaurantDTO(
                id=restaurant.id,
                name=restaurant.name,
                subdomain=restaurant.subdomain,
                description=restaurant.description,
                address=restaurant.address,
                latitude=restaurant.latitude,
                longitude=restaurant.longitude,
                whatsapp_phone=restaurant.whatsapp_phone,
                owner_display_name=(
                    restaurant.owner_contact_name or owner_display_name
                ),
                owner_phone=restaurant.owner_phone or restaurant.whatsapp_phone,
                logo_path=restaurant.logo_path,
                status=restaurant.status,
                delivery_enabled=restaurant.delivery_enabled,
            ),
        )

    def list_admin_members(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryProviderMemberDTO]:
        rows = self._session.execute(
            select(
                DeliveryProviderMember,
                User.email,
                User.display_name,
            )
            .join(User, User.id == DeliveryProviderMember.user_id)
            .where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.is_active.is_(True),
                DeliveryProviderMember.member_role.in_(("owner", "admin")),
            )
            .order_by(
                DeliveryProviderMember.member_role.desc(),
                DeliveryProviderMember.created_at.asc(),
            )
        ).all()
        return [
            DeliveryProviderMemberDTO(
                id=member.id,
                user_id=member.user_id,
                email=email,
                display_name=display_name,
                member_role=member.member_role,
                created_at=member.created_at,
            )
            for member, email, display_name in rows
        ]

    def list_admin_invites(
        self, provider_id: uuid.UUID
    ) -> Sequence[DeliveryProviderAdminInviteDTO]:
        rows = self._session.scalars(
            select(DeliveryProviderAdminInvite)
            .where(DeliveryProviderAdminInvite.delivery_provider_id == provider_id)
            .order_by(DeliveryProviderAdminInvite.created_at.asc())
        ).all()
        return [DeliveryProviderAdminInviteDTO.model_validate(row) for row in rows]

    def add_admin_invite(
        self, provider_id: uuid.UUID, email: str
    ) -> DeliveryProviderAdminInviteDTO:
        invite = DeliveryProviderAdminInvite(
            delivery_provider_id=provider_id,
            email=email,
        )
        self._session.add(invite)
        self._session.flush()
        return DeliveryProviderAdminInviteDTO.model_validate(invite)

    def remove_admin_invite(self, provider_id: uuid.UUID, invite_id: uuid.UUID) -> None:
        invite = self._session.scalar(
            select(DeliveryProviderAdminInvite).where(
                DeliveryProviderAdminInvite.id == invite_id,
                DeliveryProviderAdminInvite.delivery_provider_id == provider_id,
            )
        )
        if invite is None:
            from app.core.exceptions import NotFoundError

            raise NotFoundError("Invitación no encontrada")
        self._session.delete(invite)

    def claim_admin_invites(self, user_id: uuid.UUID, email: str) -> bool:
        normalized = email.strip().lower()
        if not normalized:
            return False

        invites = self._session.scalars(
            select(DeliveryProviderAdminInvite)
            .where(DeliveryProviderAdminInvite.email == normalized)
            .order_by(DeliveryProviderAdminInvite.created_at.asc())
        ).all()
        if not invites:
            return False

        claimed = False
        for invite in invites:
            existing = self._session.scalar(
                select(DeliveryProviderMember.id).where(
                    DeliveryProviderMember.delivery_provider_id == invite.delivery_provider_id,
                    DeliveryProviderMember.user_id == user_id,
                )
            )
            if existing is None:
                self._session.add(
                    DeliveryProviderMember(
                        delivery_provider_id=invite.delivery_provider_id,
                        user_id=user_id,
                        member_role="admin",
                        is_active=True,
                    )
                )
                claimed = True
            self._session.delete(invite)

        if claimed:
            self._session.flush()
        return claimed
