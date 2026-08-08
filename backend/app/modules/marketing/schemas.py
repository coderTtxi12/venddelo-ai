from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TaskStatus = Literal["queued", "running", "succeeded", "failed"]
AgentStatus = Literal["active", "checkpoint", "banned", "needs_manual_intervention"]


class FacebookPostCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class MarketingTaskQueuedResponse(BaseModel):
    task_id: uuid.UUID
    status: Literal["queued"] = "queued"


class MarketingTaskStatusResponse(BaseModel):
    task_id: uuid.UUID
    status: TaskStatus
    error: str | None = None
    result: dict[str, Any] | None = None


class MarketingAgentAccountDTO(BaseModel):
    id: uuid.UUID
    label: str
    status: AgentStatus
    fb_email_encrypted: str
    fb_password_encrypted: str
    storage_state_encrypted: str | None = None
    last_login_at: datetime | None = None
    session_valid_until: datetime | None = None


class MarketingTaskDTO(BaseModel):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    agent_id: uuid.UUID
    message: str
    status: TaskStatus
    error: str | None = None
    result: dict[str, Any] | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
