from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from app.modules.marketing.schemas import MarketingAgentAccountDTO, MarketingTaskDTO


class MarketingRepository(ABC):
    @abstractmethod
    def get_first_active_agent(self) -> MarketingAgentAccountDTO | None: ...

    @abstractmethod
    def get_agent(self, agent_id: uuid.UUID) -> MarketingAgentAccountDTO | None: ...

    @abstractmethod
    def update_agent_session(
        self,
        agent_id: uuid.UUID,
        *,
        storage_state_encrypted: str,
        last_login_at: datetime | None = None,
        status: str | None = None,
    ) -> None: ...

    @abstractmethod
    def mark_agent_status(self, agent_id: uuid.UUID, status: str) -> None: ...

    @abstractmethod
    def create_task(
        self,
        *,
        restaurant_id: uuid.UUID,
        agent_id: uuid.UUID,
        message: str,
    ) -> MarketingTaskDTO: ...

    @abstractmethod
    def get_task(
        self, restaurant_id: uuid.UUID, task_id: uuid.UUID
    ) -> MarketingTaskDTO | None: ...

    @abstractmethod
    def get_task_by_id(self, task_id: uuid.UUID) -> MarketingTaskDTO | None: ...

    @abstractmethod
    def mark_task_running(self, task_id: uuid.UUID) -> None: ...

    @abstractmethod
    def mark_task_finished(
        self,
        task_id: uuid.UUID,
        *,
        status: str,
        error: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> None: ...
