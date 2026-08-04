from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.assistant.profile.schemas import AssistantProfileSnapshot

ChatHistoryRole = Literal["user", "assistant"]


class AssistantChatHistoryMessage(BaseModel):
    role: ChatHistoryRole
    # TEMP: raised for bulk menu paste testing (was 8000)
    content: str = Field(min_length=1, max_length=50_000)


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


class ChatAttachmentRef(BaseModel):
    storage_path: str = Field(min_length=1, max_length=512)
    original_name: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=128)
    kind: Literal["document", "image", "menu_source", "product_photo"]
    size_bytes: int = Field(ge=1, le=20_000_000)


class AssistantConversationChatRequest(BaseModel):
    # TEMP: raised for bulk menu paste testing (was 8000)
    message: str = Field(min_length=0, max_length=50_000)
    attachments: list[ChatAttachmentRef] = Field(default_factory=list, max_length=20)
    profile_version: int = Field(ge=1)
    profile_snapshot: AssistantProfileSnapshot | None = None
    confirmation_token: str | None = None
    form_submission: dict[str, Any] | None = None

    @model_validator(mode="after")
    def require_message_or_attachments(self) -> AssistantConversationChatRequest:
        if not self.message.strip() and not self.attachments:
            raise ValueError("message or attachments required")
        return self


class AssistantChatRequest(BaseModel):
    # TEMP: raised for bulk menu paste testing (was 8000)
    message: str = Field(min_length=0, max_length=50_000)
    conversation_id: uuid.UUID | None = None
    history: list[AssistantChatHistoryMessage] = Field(default_factory=list, max_length=40)
    attachments: list[ChatAttachmentRef] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def require_message_or_attachments(self) -> AssistantChatRequest:
        if not self.message.strip() and not self.attachments:
            raise ValueError("message or attachments required")
        return self


class AssistantClarifyAnswerRequest(BaseModel):
    conversation_id: uuid.UUID
    clarify_id: uuid.UUID
    user_response: str | list[str]


class AssistantChatCompletePayload(BaseModel):
    conversation_id: str
    message_id: str
    content: str


class ImportAssetUploadDTO(BaseModel):
    path: str
    public_url: str
    mime_type: str
    size_bytes: int
    original_name: str
    kind: Literal["document", "image", "menu_source", "product_photo"]
