from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, time

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError

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
from app.modules.delivery_providers.matching import MexyZoneMatchCandidate
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
        self.seed_default_schedules(provider.id, zone.id)
        self.seed_default_pricing_config(provider.id, zone.id)
        self.seed_default_payment_methods(provider.id)
        return DeliveryProviderDTO.model_validate(provider)

    def _primary_zone_id(self, provider_id: uuid.UUID) -> uuid.UUID | None:
        return self._session.scalar(
            select(DeliveryProviderZone.id)
            .where(
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
            .order_by(DeliveryProviderZone.priority.asc(), DeliveryProviderZone.created_at.asc())
            .limit(1)
        )

    def _primary_zone_row(self, provider_id: uuid.UUID) -> DeliveryProviderZone | None:
        return self._session.scalar(
            select(DeliveryProviderZone)
            .where(
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
            .order_by(DeliveryProviderZone.priority.asc(), DeliveryProviderZone.created_at.asc())
            .limit(1)
        )

    def set_logo_path(self, provider_id: uuid.UUID, logo_path: str) -> None:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            return
        provider.logo_path = logo_path
        self._session.flush()

    def get_primary_zone(self, provider_id: uuid.UUID) -> DeliveryProviderZoneDTO | None:
        zones = self.list_zones(provider_id)
        return zones[0] if zones else None

    def list_zones(self, provider_id: uuid.UUID) -> Sequence[DeliveryProviderZoneDTO]:
        rows = (
            self._session.execute(
                text(
                    """
                    SELECT z.id, z.name, z.center_lat, z.center_lng,
                           z.weather_mode, z.service_manually_enabled,
                           ST_AsGeoJSON(z.boundary::geometry) AS boundary_geojson,
                           COUNT(rdp.id) AS restaurant_count
                    FROM delivery_provider_zones z
                    LEFT JOIN restaurant_delivery_providers rdp ON rdp.zone_id = z.id
                    WHERE z.delivery_provider_id = :provider_id AND z.is_active = true
                    GROUP BY z.id
                    ORDER BY z.priority ASC, z.created_at ASC
                    """
                ),
                {"provider_id": str(provider_id)},
            )
            .mappings()
            .all()
        )
        return [self._zone_dto_from_row(row) for row in rows]

    def get_zone(
        self, provider_id: uuid.UUID, zone_id: uuid.UUID
    ) -> DeliveryProviderZoneDTO | None:
        row = (
            self._session.execute(
                text(
                    """
                    SELECT z.id, z.name, z.center_lat, z.center_lng,
                           z.weather_mode, z.service_manually_enabled,
                           ST_AsGeoJSON(z.boundary::geometry) AS boundary_geojson,
                           COUNT(rdp.id) AS restaurant_count
                    FROM delivery_provider_zones z
                    LEFT JOIN restaurant_delivery_providers rdp ON rdp.zone_id = z.id
                    WHERE z.delivery_provider_id = :provider_id
                      AND z.id = :zone_id
                      AND z.is_active = true
                    GROUP BY z.id
                    """
                ),
                {"provider_id": str(provider_id), "zone_id": str(zone_id)},
            )
            .mappings()
            .first()
        )
        if row is None:
            return None
        return self._zone_dto_from_row(row)

    def create_zone(
        self,
        provider_id: uuid.UUID,
        *,
        name: str,
        geojson: str,
        center_lat: float | None,
        center_lng: float | None,
    ) -> DeliveryProviderZoneDTO:
        zone = DeliveryProviderZone(
            delivery_provider_id=provider_id,
            name=name,
            zone_kind="polygon",
            is_active=True,
            priority=0,
            center_lat=center_lat,
            center_lng=center_lng,
            weather_mode="none",
            service_manually_enabled=True,
        )
        self._session.add(zone)
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe una zona con ese nombre") from exc

        try:
            self._session.execute(
                text(
                    """
                    UPDATE delivery_provider_zones
                    SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)::geography
                    WHERE id = :zone_id
                    """
                ),
                {"geojson": geojson, "zone_id": str(zone.id)},
            )
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe una zona con ese nombre") from exc

        self.seed_default_schedules(provider_id, zone.id)
        self.seed_default_pricing_config(provider_id, zone.id)
        created = self.get_zone(provider_id, zone.id)
        if created is None:
            raise ValueError("Failed to load created zone")
        return created

    def update_zone(
        self,
        provider_id: uuid.UUID,
        zone_id: uuid.UUID,
        *,
        name: str,
        geojson: str,
        center_lat: float | None,
        center_lng: float | None,
    ) -> DeliveryProviderZoneDTO:
        zone = self._session.scalar(
            select(DeliveryProviderZone).where(
                DeliveryProviderZone.id == zone_id,
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
        )
        if zone is None:
            raise NotFoundError("Zona no encontrada")

        zone.name = name
        zone.center_lat = center_lat
        zone.center_lng = center_lng
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe una zona con ese nombre") from exc

        try:
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
                    "geojson": geojson,
                    "zone_id": str(zone_id),
                    "center_lat": center_lat,
                    "center_lng": center_lng,
                    "zone_name": name,
                },
            )
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe una zona con ese nombre") from exc

        updated = self.get_zone(provider_id, zone_id)
        if updated is None:
            raise NotFoundError("Zona no encontrada")
        return updated

    def delete_zone(self, provider_id: uuid.UUID, zone_id: uuid.UUID) -> None:
        zone = self._session.scalar(
            select(DeliveryProviderZone).where(
                DeliveryProviderZone.id == zone_id,
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
        )
        if zone is None:
            raise NotFoundError("Zona no encontrada")

        if self.count_zones(provider_id) <= 1:
            raise ConflictError("Debes conservar al menos una zona")

        partnership_count = self.count_partnerships_for_zone(zone_id)
        if partnership_count > 0:
            message = (
                "Reasigna 1 negocio antes de eliminar esta zona"
                if partnership_count == 1
                else f"Reasigna {partnership_count} negocios antes de eliminar esta zona"
            )
            raise ConflictError(message)

        self._session.delete(zone)
        self._session.flush()

    def count_partnerships_for_zone(self, zone_id: uuid.UUID) -> int:
        count = self._session.scalar(
            select(func.count())
            .select_from(RestaurantDeliveryProvider)
            .where(RestaurantDeliveryProvider.zone_id == zone_id)
        )
        return int(count or 0)

    def count_zones(self, provider_id: uuid.UUID) -> int:
        count = self._session.scalar(
            select(func.count())
            .select_from(DeliveryProviderZone)
            .where(
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
        )
        return int(count or 0)

    @staticmethod
    def _zone_dto_from_row(row) -> DeliveryProviderZoneDTO:
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
            weather_mode=row["weather_mode"],
            service_manually_enabled=row["service_manually_enabled"],
            restaurant_count=int(row["restaurant_count"] or 0),
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

        self._session.flush()
        self._session.refresh(provider)
        return DeliveryProviderDTO.model_validate(provider)

    def assert_zone_on_provider(self, provider_id: uuid.UUID, zone_id: uuid.UUID) -> None:
        zone = self._session.scalar(
            select(DeliveryProviderZone.id).where(
                DeliveryProviderZone.id == zone_id,
                DeliveryProviderZone.delivery_provider_id == provider_id,
                DeliveryProviderZone.is_active.is_(True),
            )
        )
        if zone is None:
            raise NotFoundError("Zona no encontrada")

    def list_schedules(self, zone_id: uuid.UUID) -> Sequence[DeliveryProviderScheduleDTO]:
        rows = self._session.scalars(
            select(DeliveryProviderSchedule)
            .where(DeliveryProviderSchedule.zone_id == zone_id)
            .order_by(
                DeliveryProviderSchedule.schedule_kind.asc(),
                DeliveryProviderSchedule.day_of_week.asc(),
                DeliveryProviderSchedule.opens_at.asc(),
            )
        ).all()
        return [DeliveryProviderScheduleDTO.model_validate(row) for row in rows]

    def set_schedules(
        self,
        zone_id: uuid.UUID,
        schedules: Sequence[DeliveryProviderScheduleCreate],
    ) -> None:
        zone = self._session.get(DeliveryProviderZone, zone_id)
        if zone is None:
            raise ValueError("Zone not found")

        self._session.query(DeliveryProviderSchedule).filter_by(zone_id=zone_id).delete()
        for entry in schedules:
            self._session.add(
                DeliveryProviderSchedule(
                    delivery_provider_id=zone.delivery_provider_id,
                    zone_id=zone_id,
                    schedule_kind=entry.schedule_kind,
                    day_of_week=entry.day_of_week,
                    opens_at=entry.opens_at,
                    closes_at=entry.closes_at,
                )
            )
        self._session.flush()

    def seed_default_schedules(self, provider_id: uuid.UUID, zone_id: uuid.UUID) -> None:
        existing = self._session.scalar(
            select(DeliveryProviderSchedule.id)
            .where(DeliveryProviderSchedule.zone_id == zone_id)
            .limit(1)
        )
        if existing is not None:
            return

        for day_of_week in range(7):
            for schedule_kind, opens_at, closes_at in DEFAULT_SCHEDULE_ROWS:
                self._session.add(
                    DeliveryProviderSchedule(
                        delivery_provider_id=provider_id,
                        zone_id=zone_id,
                        schedule_kind=schedule_kind,
                        day_of_week=day_of_week,
                        opens_at=opens_at,
                        closes_at=closes_at,
                    )
                )
        self._session.flush()

    def get_service_manually_enabled(self, zone_id: uuid.UUID) -> bool:
        zone = self._session.get(DeliveryProviderZone, zone_id)
        if zone is None:
            raise ValueError("Zone not found")
        return zone.service_manually_enabled

    def set_service_manually_enabled(self, zone_id: uuid.UUID, enabled: bool) -> bool:
        zone = self._session.get(DeliveryProviderZone, zone_id)
        if zone is None:
            raise ValueError("Zone not found")
        zone.service_manually_enabled = enabled
        self._session.flush()
        return zone.service_manually_enabled

    def get_provider_timezone(self, provider_id: uuid.UUID) -> str:
        provider = self._session.get(DeliveryProvider, provider_id)
        if provider is None:
            raise ValueError("Delivery provider not found")
        return provider.timezone

    def get_pricing_config(self, zone_id: uuid.UUID) -> DeliveryProviderPricingConfigDTO | None:
        row = self._session.scalar(
            select(DeliveryProviderPricingConfig).where(
                DeliveryProviderPricingConfig.zone_id == zone_id,
            )
        )
        if row is None:
            return None
        return self._pricing_dto_from_row(row)

    def set_pricing_config(
        self, zone_id: uuid.UUID, config: DeliveryProviderPricingConfigDTO
    ) -> DeliveryProviderPricingConfigDTO:
        zone = self._session.get(DeliveryProviderZone, zone_id)
        if zone is None:
            raise ValueError("Zone not found")
        row = self._session.scalar(
            select(DeliveryProviderPricingConfig).where(
                DeliveryProviderPricingConfig.zone_id == zone_id,
            )
        )
        payload = config_to_json(self._pricing_config_from_dto(config))
        if row is None:
            row = DeliveryProviderPricingConfig(
                delivery_provider_id=zone.delivery_provider_id,
                zone_id=zone_id,
                inside_polygon=payload["inside_polygon"],  # type: ignore[arg-type]
                outside_polygon=payload["outside_polygon"],  # type: ignore[arg-type]
            )
            self._session.add(row)
        else:
            row.inside_polygon = payload["inside_polygon"]  # type: ignore[assignment]
            row.outside_polygon = payload["outside_polygon"]  # type: ignore[assignment]
        self._session.flush()
        return self._pricing_dto_from_row(row)

    def seed_default_pricing_config(self, provider_id: uuid.UUID, zone_id: uuid.UUID) -> None:
        existing = self._session.scalar(
            select(DeliveryProviderPricingConfig.id).where(
                DeliveryProviderPricingConfig.zone_id == zone_id
            )
        )
        if existing is not None:
            return

        defaults = default_pricing_config()
        payload = config_to_json(defaults)
        self._session.add(
            DeliveryProviderPricingConfig(
                delivery_provider_id=provider_id,
                zone_id=zone_id,
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

    def get_weather_mode(self, zone_id: uuid.UUID) -> str:
        zone = self._session.get(DeliveryProviderZone, zone_id)
        if zone is None:
            raise ValueError("Zone not found")
        return zone.weather_mode

    def set_weather_mode(self, zone_id: uuid.UUID, weather_mode: str) -> str:
        zone = self._session.get(DeliveryProviderZone, zone_id)
        if zone is None:
            raise ValueError("Zone not found")
        zone.weather_mode = weather_mode
        self._session.flush()
        return zone.weather_mode

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
        )
        self._session.add(provider)
        self._session.flush()
        self.seed_default_payment_methods(provider.id)
        return provider.id

    def ensure_partnership_request(
        self, restaurant_id: uuid.UUID, provider_id: uuid.UUID, zone_id: uuid.UUID
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
            zone_id=zone_id,
            status="pending",
            is_default=False,
        )
        self._session.add(link)
        self._session.flush()
        return True

    def list_mexy_zone_match_candidates(
        self, latitude: float, longitude: float
    ) -> Sequence[MexyZoneMatchCandidate]:
        rows = self._session.execute(
            text(
                """
                SELECT z.id,
                       z.name,
                       z.delivery_provider_id,
                       z.priority,
                       z.created_at,
                       p.name AS provider_name,
                       ST_Distance(
                         z.boundary,
                         ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                       ) AS distance_m,
                       (pc.outside_polygon->>'max_distance_km')::float AS max_km
                FROM delivery_provider_zones z
                JOIN delivery_providers p ON p.id = z.delivery_provider_id
                JOIN delivery_provider_pricing_configs pc ON pc.zone_id = z.id
                WHERE z.is_active = true
                  AND z.boundary IS NOT NULL
                  AND (p.slug = :legacy_slug OR p.slug LIKE :slug_pattern)
                """
            ),
            {
                "lat": latitude,
                "lng": longitude,
                "legacy_slug": MEXY_LEGACY_SLUG,
                "slug_pattern": f"{MEXY_PROVIDER_SLUG_PREFIX}%",
            },
        ).mappings()

        return [
            MexyZoneMatchCandidate(
                id=row["id"],
                name=row["name"],
                provider_id=row["delivery_provider_id"],
                provider_name=row["provider_name"],
                priority=int(row["priority"]),
                created_at=row["created_at"],
                distance_km=float(row["distance_m"]) / 1000.0,
                max_km=float(row["max_km"]),
            )
            for row in rows
        ]

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
            zone_id=link.zone_id,
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
                DeliveryProviderMember.member_role.in_(("owner", "admin", "operator")),
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
        self, provider_id: uuid.UUID, email: str, member_role: str = "admin"
    ) -> DeliveryProviderAdminInviteDTO:
        invite = DeliveryProviderAdminInvite(
            delivery_provider_id=provider_id,
            email=email,
            member_role=member_role,
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
                        member_role=invite.member_role,
                        is_active=True,
                    )
                )
                claimed = True
            self._session.delete(invite)

        if claimed:
            self._session.flush()
        return claimed
