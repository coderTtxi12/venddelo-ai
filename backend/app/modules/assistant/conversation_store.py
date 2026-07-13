"""Persist and load assistant conversation turns for workflow context."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from app.core.config import Settings, get_settings
from app.core.exceptions import ForbiddenError
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.repository import AssistantRepository
from app.modules.assistant.schemas import AssistantChatHistoryMessage, AssistantMessageDTO

logger = logging.getLogger(__name__)


def _title_from_message(message: str) -> str:
    collapsed = " ".join(message.strip().split())
    if not collapsed:
        return "Nueva conversación"
    if len(collapsed) <= 60:
        return collapsed
    return f"{collapsed[:57]}…"


def ensure_conversation(
    repo: AssistantRepository,
    *,
    restaurant_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    first_message: str,
) -> uuid.UUID:
    if conversation_id is not None:
        conversation = repo.get_conversation(conversation_id)
        if conversation is not None:
            if conversation.restaurant_id != restaurant_id:
                raise ForbiddenError("You do not own this conversation")
            return conversation_id

    created = repo.create_conversation(
        restaurant_id=restaurant_id,
        title=_title_from_message(first_message),
    )
    return created.id


def ensure_conversation_committed(
    *,
    restaurant_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    first_message: str,
) -> uuid.UUID:
    """Persist or verify the conversation in a committed txn for isolated tool sessions."""
    uow = SqlAlchemyUnitOfWork()
    uow.__enter__()
    try:
        resolved = ensure_conversation(
            assistant_repository(uow),
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            first_message=first_message,
        )
        uow.commit()
        return resolved
    except Exception:
        uow.rollback()
        raise
    finally:
        uow.__exit__(None, None, None)


def load_recent_history(
    repo: AssistantRepository,
    conversation_id: uuid.UUID,
    *,
    settings: Settings | None = None,
    message_limit: int | None = None,
) -> list[AssistantChatHistoryMessage]:
    resolved = settings or get_settings()
    limit = message_limit if message_limit is not None else resolved.assistant_llm_context_message_limit
    rows = repo.list_recent_messages_for_context(
        conversation_id,
        limit=limit,
    )
    return [_history_message(row) for row in rows]


def persist_turn(
    repo: AssistantRepository,
    *,
    conversation_id: uuid.UUID,
    user_message: str,
    assistant_message: str,
) -> None:
    cleaned_user = user_message.strip()
    cleaned_assistant = assistant_message.strip()
    if not cleaned_user or not cleaned_assistant:
        return

    now = datetime.now(UTC)
    repo.add_message(conversation_id=conversation_id, role="user", content=cleaned_user)
    repo.add_message(conversation_id=conversation_id, role="assistant", content=cleaned_assistant)
    repo.update_conversation(conversation_id, last_message_at=now)


def _persist_turn_with_new_session(
    *,
    conversation_id: uuid.UUID,
    user_message: str,
    assistant_message: str,
) -> None:
    uow = SqlAlchemyUnitOfWork()
    uow.__enter__()
    try:
        persist_turn(
            assistant_repository(uow),
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=assistant_message,
        )
        uow.commit()
    except Exception:
        uow.rollback()
        raise
    finally:
        uow.__exit__(None, None, None)


def schedule_persist_turn(
    *,
    conversation_id: uuid.UUID,
    user_message: str,
    assistant_message: str,
) -> None:
    """Persist a completed turn without blocking the SSE response stream."""
    cleaned_user = user_message.strip()
    cleaned_assistant = assistant_message.strip()
    if not cleaned_user or not cleaned_assistant:
        return

    async def _run() -> None:
        try:
            await asyncio.to_thread(
                _persist_turn_with_new_session,
                conversation_id=conversation_id,
                user_message=cleaned_user,
                assistant_message=cleaned_assistant,
            )
        except Exception:
            logger.exception(
                "Failed to persist assistant turn conversation_id=%s",
                conversation_id,
            )

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        logger.warning(
            "No running event loop; skipping background persist conversation_id=%s",
            conversation_id,
        )


def _history_message(row: AssistantMessageDTO) -> AssistantChatHistoryMessage:
    return AssistantChatHistoryMessage(role=row.role, content=row.content)


def assistant_repository(uow: SqlAlchemyUnitOfWork) -> AssistantRepository:
    return uow.assistant
