from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, time

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models.delivery import (
    DeliveryProvider,
    DeliveryProviderMember,
    DeliveryProviderSchedule,
    DeliveryProviderZone,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryProviderDTO,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderZoneDTO,
    GeoJsonPolygon,
)

DEFAULT_SCHEDULE_ROWS: tuple[tuple[str, time, time], ...] = (
    ("regular", time(9, 0), time(21, 0)),
    ("night", time(21, 0), time(22, 0)),
)


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
