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
from app.modules.delivery_providers.schemas import DeliveryProviderDTO


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
