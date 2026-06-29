from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models.assistant_profile import RestaurantAssistantEntitlement
from app.modules.assistant.entitlements.schemas import (
    EntitlementOverridesRecord,
    EntitlementOverridesRepository,
)


def _to_record(obj: RestaurantAssistantEntitlement) -> EntitlementOverridesRecord:
    return EntitlementOverridesRecord(
        restaurant_id=obj.restaurant_id,
        granted_extra=list(obj.granted_extra or []),
        revoked=list(obj.revoked or []),
        expires_at=obj.expires_at,
        source=obj.source,
        updated_at=obj.updated_at,
    )


class SqlAlchemyEntitlementOverridesRepository(EntitlementOverridesRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, restaurant_id: uuid.UUID) -> EntitlementOverridesRecord | None:
        obj = self._session.get(RestaurantAssistantEntitlement, restaurant_id)
        return _to_record(obj) if obj else None
