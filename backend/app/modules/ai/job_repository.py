from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.modules.ai.schemas import AIJobCreate, AIJobDTO, AIJobUpdate


class AIJobRepository(ABC):
    @abstractmethod
    def add(self, data: AIJobCreate) -> AIJobDTO: ...

    @abstractmethod
    def get(self, restaurant_id: uuid.UUID, job_id: uuid.UUID) -> AIJobDTO | None: ...

    @abstractmethod
    def update(self, job_id: uuid.UUID, data: AIJobUpdate) -> AIJobDTO | None: ...
