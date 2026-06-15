from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.ai import AIJob
from app.modules.ai.job_repository import AIJobRepository
from app.modules.ai.schemas import AIJobCreate, AIJobDTO, AIJobUpdate


class SqlAlchemyAIJobRepository(AIJobRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, data: AIJobCreate) -> AIJobDTO:
        obj = AIJob(**data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return AIJobDTO.model_validate(obj)

    def get(self, restaurant_id: uuid.UUID, job_id: uuid.UUID) -> AIJobDTO | None:
        obj = self._session.scalar(
            select(AIJob).where(
                AIJob.id == job_id,
                AIJob.restaurant_id == restaurant_id,
            )
        )
        return AIJobDTO.model_validate(obj) if obj else None

    def update(self, job_id: uuid.UUID, data: AIJobUpdate) -> AIJobDTO | None:
        obj = self._session.get(AIJob, job_id)
        if obj is None:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        self._session.flush()
        return AIJobDTO.model_validate(obj)
