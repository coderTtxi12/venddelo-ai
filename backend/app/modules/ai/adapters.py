from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.ai import AIArtifact
from app.modules.ai.repository import AIArtifactRepository
from app.modules.ai.schemas import AIArtifactCreate, AIArtifactDTO


class SqlAlchemyAIArtifactRepository(AIArtifactRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, data: AIArtifactCreate) -> AIArtifactDTO:
        obj = AIArtifact(**data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return AIArtifactDTO.model_validate(obj)

    def list_for_entity(
        self, restaurant_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
    ) -> list[AIArtifactDTO]:
        rows = self._session.scalars(
            select(AIArtifact)
            .where(
                AIArtifact.restaurant_id == restaurant_id,
                AIArtifact.entity_type == entity_type,
                AIArtifact.entity_id == entity_id,
            )
            .order_by(AIArtifact.created_at.desc())
        )
        return [AIArtifactDTO.model_validate(r) for r in rows]

    def get_latest(
        self,
        restaurant_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
    ) -> AIArtifactDTO | None:
        obj = self._session.scalar(
            select(AIArtifact)
            .where(
                AIArtifact.restaurant_id == restaurant_id,
                AIArtifact.entity_type == entity_type,
                AIArtifact.entity_id == entity_id,
                AIArtifact.field == field,
            )
            .order_by(AIArtifact.created_at.desc())
            .limit(1)
        )
        return AIArtifactDTO.model_validate(obj) if obj else None

    def mark_reverted(self, id: uuid.UUID) -> AIArtifactDTO | None:
        obj = self._session.get(AIArtifact, id)
        if obj is None:
            return None
        obj.status = "reverted"
        self._session.flush()
        return AIArtifactDTO.model_validate(obj)

    def get(self, restaurant_id: uuid.UUID, artifact_id: uuid.UUID) -> AIArtifactDTO | None:
        obj = self._session.scalar(
            select(AIArtifact).where(
                AIArtifact.id == artifact_id,
                AIArtifact.restaurant_id == restaurant_id,
            )
        )
        return AIArtifactDTO.model_validate(obj) if obj else None

    def list_for_restaurant(self, restaurant_id: uuid.UUID) -> list[AIArtifactDTO]:
        rows = self._session.scalars(
            select(AIArtifact)
            .where(AIArtifact.restaurant_id == restaurant_id)
            .order_by(AIArtifact.created_at.desc())
        )
        return [AIArtifactDTO.model_validate(r) for r in rows]
