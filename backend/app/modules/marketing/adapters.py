from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.marketing import MarketingAgentAccount, MarketingTask
from app.modules.marketing.repository import MarketingRepository
from app.modules.marketing.schemas import (
    AgentStatus,
    MarketingAgentAccountDTO,
    MarketingTaskDTO,
    TaskStatus,
)


class SqlAlchemyMarketingRepository(MarketingRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def _agent_to_dto(self, row: MarketingAgentAccount) -> MarketingAgentAccountDTO:
        return MarketingAgentAccountDTO(
            id=row.id,
            label=row.label,
            status=cast(AgentStatus, row.status),
            fb_email_encrypted=row.fb_email_encrypted,
            fb_password_encrypted=row.fb_password_encrypted,
            storage_state_encrypted=row.storage_state_encrypted,
            last_login_at=row.last_login_at,
            session_valid_until=row.session_valid_until,
        )

    def _task_to_dto(self, row: MarketingTask) -> MarketingTaskDTO:
        return MarketingTaskDTO(
            id=row.id,
            restaurant_id=row.restaurant_id,
            agent_id=row.agent_id,
            message=row.message,
            status=cast(TaskStatus, row.status),
            error=row.error,
            result=row.result,
            created_at=row.created_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
        )

    def get_first_active_agent(self) -> MarketingAgentAccountDTO | None:
        row = self._session.scalar(
            select(MarketingAgentAccount)
            .where(MarketingAgentAccount.status == "active")
            .order_by(MarketingAgentAccount.created_at.asc())
            .limit(1)
        )
        return self._agent_to_dto(row) if row else None

    def get_agent(self, agent_id: uuid.UUID) -> MarketingAgentAccountDTO | None:
        row = self._session.get(MarketingAgentAccount, agent_id)
        return self._agent_to_dto(row) if row else None

    def update_agent_session(
        self,
        agent_id: uuid.UUID,
        *,
        storage_state_encrypted: str,
        last_login_at: datetime | None = None,
        status: str | None = None,
    ) -> None:
        row = self._session.get(MarketingAgentAccount, agent_id)
        if row is None:
            return
        row.storage_state_encrypted = storage_state_encrypted
        if last_login_at is not None:
            row.last_login_at = last_login_at
        if status is not None:
            row.status = status
        self._session.flush()

    def mark_agent_status(self, agent_id: uuid.UUID, status: str) -> None:
        row = self._session.get(MarketingAgentAccount, agent_id)
        if row is None:
            return
        row.status = status
        self._session.flush()

    def create_task(
        self,
        *,
        restaurant_id: uuid.UUID,
        agent_id: uuid.UUID,
        message: str,
    ) -> MarketingTaskDTO:
        row = MarketingTask(
            restaurant_id=restaurant_id,
            agent_id=agent_id,
            message=message,
            status="queued",
        )
        self._session.add(row)
        self._session.flush()
        return self._task_to_dto(row)

    def get_task(
        self, restaurant_id: uuid.UUID, task_id: uuid.UUID
    ) -> MarketingTaskDTO | None:
        row = self._session.scalar(
            select(MarketingTask).where(
                MarketingTask.id == task_id,
                MarketingTask.restaurant_id == restaurant_id,
            )
        )
        return self._task_to_dto(row) if row else None

    def mark_task_running(self, task_id: uuid.UUID) -> None:
        row = self._session.get(MarketingTask, task_id)
        if row is None:
            return
        row.status = "running"
        row.started_at = datetime.now(UTC)
        self._session.flush()

    def mark_task_finished(
        self,
        task_id: uuid.UUID,
        *,
        status: str,
        error: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> None:
        row = self._session.get(MarketingTask, task_id)
        if row is None:
            return
        row.status = status
        row.error = error
        row.result = result
        row.finished_at = datetime.now(UTC)
        self._session.flush()
