from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.assistant.profile.schemas import AssistantProfileSnapshot

ChatHistoryRole = Literal["user", "assistant"]


class AssistantChatHistoryMessage(BaseModel):
    role: ChatHistoryRole
    content: str = Field(min_length=1, max_length=8000)


class AssistantConversationDTO(BaseModel):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    title: str
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssistantMessageDTO(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: ChatHistoryRole
    content: str
    metadata: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssistantConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=120)


class AssistantConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    is_archived: bool | None = None


class AssistantConversationChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    profile_version: int = Field(ge=1)
    profile_snapshot: AssistantProfileSnapshot | None = None
    confirmation_token: str | None = None
    form_submission: dict[str, Any] | None = None


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[AssistantChatHistoryMessage] = Field(default_factory=list, max_length=40)


class AssistantChatCompletePayload(BaseModel):
    conversation_id: str
    message_id: str
    content: str
