from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.assistant import AssistantConversation, AssistantMessage
from app.modules.assistant.repository import AssistantRepository
from app.modules.assistant.schemas import AssistantConversationDTO, AssistantMessageDTO


def _conversation_dto(obj: AssistantConversation) -> AssistantConversationDTO:
    return AssistantConversationDTO.model_validate(obj)


def _message_dto(obj: AssistantMessage) -> AssistantMessageDTO:
    return AssistantMessageDTO(
        id=obj.id,
        conversation_id=obj.conversation_id,
        role=obj.role,  # type: ignore[arg-type]
        content=obj.content,
        metadata=obj.metadata_json,
        created_at=obj.created_at,
    )


class SqlAlchemyAssistantRepository(AssistantRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_conversation(
        self,
        *,
        restaurant_id: uuid.UUID,
        title: str = "Nueva conversación",
    ) -> AssistantConversationDTO:
        now = datetime.now(UTC)
        obj = AssistantConversation(
            restaurant_id=restaurant_id,
            title=title,
            last_message_at=now,
        )
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return _conversation_dto(obj)

    def get_conversation(self, conversation_id: uuid.UUID) -> AssistantConversationDTO | None:
        obj = self._session.get(AssistantConversation, conversation_id)
        if obj is None or not obj.is_active:
            return None
        return _conversation_dto(obj)

    def list_conversations(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
    ) -> CursorPage[AssistantConversationDTO]:
        stmt = (
            select(AssistantConversation)
            .where(
                AssistantConversation.restaurant_id == restaurant_id,
                AssistantConversation.is_active.is_(True),
            )
            .order_by(
                AssistantConversation.last_message_at.desc(),
                AssistantConversation.id.desc(),
            )
            .limit(params.limit + 1)
        )

        if params.cursor:
            cursor_at, cursor_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(
                tuple_(AssistantConversation.last_message_at, AssistantConversation.id)
                < tuple_(cursor_at, cursor_id)
            )

        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        items = rows[: params.limit]
        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = encode_keyset_cursor(last.last_message_at, last.id)

        return CursorPage(
            items=[_conversation_dto(row) for row in items],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update_conversation(
        self,
        conversation_id: uuid.UUID,
        *,
        title: str | None = None,
        last_message_at: datetime | None = None,
        is_active: bool | None = None,
        deleted_at: datetime | None = None,
    ) -> AssistantConversationDTO | None:
        obj = self._session.get(AssistantConversation, conversation_id)
        if obj is None:
            return None

        if title is not None:
            obj.title = title
        if last_message_at is not None:
            obj.last_message_at = last_message_at
        if is_active is not None:
            obj.is_active = is_active
        if deleted_at is not None:
            obj.deleted_at = deleted_at

        self._session.flush()
        self._session.refresh(obj)
        return _conversation_dto(obj)

    def add_message(
        self,
        *,
        conversation_id: uuid.UUID,
        role: str,
        content: str,
        message_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
        created_at: datetime | None = None,
    ) -> AssistantMessageDTO:
        obj = AssistantMessage(
            id=message_id or uuid.uuid4(),
            conversation_id=conversation_id,
            role=role,
            content=content,
            metadata_json=metadata,
            created_at=created_at or datetime.now(UTC),
        )
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return _message_dto(obj)

    def list_messages(
        self,
        conversation_id: uuid.UUID,
        params: PaginationParams,
    ) -> CursorPage[AssistantMessageDTO]:
        stmt = (
            select(AssistantMessage)
            .where(AssistantMessage.conversation_id == conversation_id)
            .order_by(AssistantMessage.created_at.asc(), AssistantMessage.id.asc())
            .limit(params.limit + 1)
        )

        if params.cursor:
            cursor_at, cursor_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(
                tuple_(AssistantMessage.created_at, AssistantMessage.id)
                > tuple_(cursor_at, cursor_id)
            )

        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        items = rows[: params.limit]
        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = encode_keyset_cursor(last.created_at, last.id)

        return CursorPage(
            items=[_message_dto(row) for row in items],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def list_recent_messages_for_context(
        self,
        conversation_id: uuid.UUID,
        *,
        limit: int,
    ) -> list[AssistantMessageDTO]:
        stmt = (
            select(AssistantMessage)
            .where(AssistantMessage.conversation_id == conversation_id)
            .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
            .limit(limit)
        )
        rows = list(self._session.scalars(stmt))
        rows.reverse()
        return [_message_dto(row) for row in rows]
