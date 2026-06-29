from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models.assistant_profile import RestaurantAssistantEntitlement
from app.modules.assistant.entitlements.schemas import (
    RestaurantEntitlementsRecord,
    RestaurantEntitlementsRepository,
)


def _to_record(obj: RestaurantAssistantEntitlement) -> RestaurantEntitlementsRecord:
    return RestaurantEntitlementsRecord(
        restaurant_id=obj.restaurant_id,
        granted_skill_ids=list(obj.granted_skill_ids or []),
        expires_at=obj.expires_at,
        source=obj.source,
        updated_at=obj.updated_at,
    )


class SqlAlchemyRestaurantEntitlementsRepository(RestaurantEntitlementsRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, restaurant_id: uuid.UUID) -> RestaurantEntitlementsRecord | None:
        obj = self._session.get(RestaurantAssistantEntitlement, restaurant_id)
        return _to_record(obj) if obj else None

    def create_default(
        self,
        restaurant_id: uuid.UUID,
        *,
        granted_skill_ids: list[str],
        source: str = "default",
    ) -> RestaurantEntitlementsRecord:
        obj = RestaurantAssistantEntitlement(
            restaurant_id=restaurant_id,
            granted_skill_ids=list(granted_skill_ids),
            source=source,
        )
        self._session.add(obj)
        self._session.flush()
        return _to_record(obj)

    def get_or_create_default(
        self,
        restaurant_id: uuid.UUID,
        *,
        granted_skill_ids: list[str],
        source: str = "default",
    ) -> RestaurantEntitlementsRecord:
        existing = self.get(restaurant_id)
        if existing is not None:
            return existing
        return self.create_default(
            restaurant_id,
            granted_skill_ids=granted_skill_ids,
            source=source,
        )


# Backward-compatible alias for existing imports.
SqlAlchemyEntitlementOverridesRepository = SqlAlchemyRestaurantEntitlementsRepository
EntitlementOverridesRecord = RestaurantEntitlementsRecord
EntitlementOverridesRepository = RestaurantEntitlementsRepository
