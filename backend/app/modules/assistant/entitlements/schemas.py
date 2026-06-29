from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime

from pydantic import BaseModel, Field


class RestaurantEntitlementsRecord(BaseModel):
    restaurant_id: uuid.UUID
    granted_skill_ids: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None
    source: str | None = None
    updated_at: datetime

    @property
    def is_active(self) -> bool:
        if self.expires_at is None:
            return True
        return self.expires_at > datetime.now(UTC)


class RestaurantEntitlementsRepository(ABC):
    @abstractmethod
    def get(self, restaurant_id: uuid.UUID) -> RestaurantEntitlementsRecord | None: ...

    @abstractmethod
    def create_default(
        self,
        restaurant_id: uuid.UUID,
        *,
        granted_skill_ids: list[str],
        source: str = "default",
    ) -> RestaurantEntitlementsRecord: ...
