from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime

from pydantic import BaseModel, Field


class EntitlementOverridesRecord(BaseModel):
    restaurant_id: uuid.UUID
    granted_extra: list[str] = Field(default_factory=list)
    revoked: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None
    source: str | None = None
    updated_at: datetime


class EntitlementOverridesRepository(ABC):
    @abstractmethod
    def get(self, restaurant_id: uuid.UUID) -> EntitlementOverridesRecord | None: ...
