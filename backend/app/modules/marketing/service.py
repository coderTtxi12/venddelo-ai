from __future__ import annotations

import uuid

from app.core.exceptions import NotFoundError
from app.modules.marketing.repository import MarketingRepository
from app.modules.marketing.schemas import (
    MarketingTaskQueuedResponse,
    MarketingTaskStatusResponse,
)


class MarketingService:
    def __init__(self, repo: MarketingRepository) -> None:
        self._repo = repo

    def enqueue_facebook_post(
        self, restaurant_id: uuid.UUID, message: str
    ) -> MarketingTaskQueuedResponse:
        agent = self._repo.get_first_active_agent()
        if agent is None:
            raise NotFoundError("No active marketing agent account")
        task = self._repo.create_task(
            restaurant_id=restaurant_id,
            agent_id=agent.id,
            message=message,
        )
        return MarketingTaskQueuedResponse(task_id=task.id, status="queued")

    def get_task(
        self, restaurant_id: uuid.UUID, task_id: uuid.UUID
    ) -> MarketingTaskStatusResponse:
        task = self._repo.get_task(restaurant_id, task_id)
        if task is None:
            raise NotFoundError("Marketing task not found")
        return MarketingTaskStatusResponse(
            task_id=task.id,
            status=task.status,
            error=task.error,
            result=task.result,
        )
