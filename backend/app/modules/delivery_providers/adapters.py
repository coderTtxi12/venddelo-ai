from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models.delivery import (
    DeliveryProvider,
    DeliveryProviderMember,
    DeliveryProviderZone,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import DeliveryProviderDTO, DeliveryProviderZoneDTO, GeoJsonPolygon


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
