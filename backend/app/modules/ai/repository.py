from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.modules.ai.schemas import AIArtifactCreate, AIArtifactDTO


class AIArtifactRepository(ABC):
    @abstractmethod
    def add(self, data: AIArtifactCreate) -> AIArtifactDTO: ...

    @abstractmethod
    def list_for_entity(
        self, restaurant_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
    ) -> list[AIArtifactDTO]: ...

    @abstractmethod
    def get_latest(
        self,
        restaurant_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
    ) -> AIArtifactDTO | None: ...

    @abstractmethod
    def mark_reverted(self, id: uuid.UUID) -> AIArtifactDTO | None: ...
