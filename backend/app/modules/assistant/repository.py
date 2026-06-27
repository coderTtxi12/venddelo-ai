from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from app.core.pagination import CursorPage, PaginationParams
from app.modules.assistant.schemas import (
    AssistantConversationDTO,
    AssistantMessageDTO,
    ChatHistoryRole,
)


class AssistantRepository(ABC):
    @abstractmethod
    def create_conversation(
        self,
        *,
        restaurant_id: uuid.UUID,
        title: str = "Nueva conversación",
    ) -> AssistantConversationDTO: ...

    @abstractmethod
    def get_conversation(self, conversation_id: uuid.UUID) -> AssistantConversationDTO | None: ...

    @abstractmethod
    def list_conversations(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
    ) -> CursorPage[AssistantConversationDTO]: ...

    @abstractmethod
    def update_conversation(
        self,
        conversation_id: uuid.UUID,
        *,
        title: str | None = None,
        last_message_at: datetime | None = None,
        is_active: bool | None = None,
        deleted_at: datetime | None = None,
    ) -> AssistantConversationDTO | None: ...

    @abstractmethod
    def add_message(
        self,
        *,
        conversation_id: uuid.UUID,
        role: ChatHistoryRole,
        content: str,
        message_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
        created_at: datetime | None = None,
    ) -> AssistantMessageDTO: ...

    @abstractmethod
    def list_messages(
        self,
        conversation_id: uuid.UUID,
        params: PaginationParams,
    ) -> CursorPage[AssistantMessageDTO]: ...

    @abstractmethod
    def list_recent_messages_for_context(
        self,
        conversation_id: uuid.UUID,
        *,
        limit: int,
    ) -> list[AssistantMessageDTO]: ...
