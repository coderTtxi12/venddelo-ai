from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.core.config import Settings, get_settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.llm.ports import ChatStreamEvent, LLMProviderPort
from app.core.pagination import CursorPage, PaginationParams
from app.infra.redis.factory import build_cache
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.lane_queue import ConversationLaneQueue
from app.modules.assistant.agent.orchestrator import AgentOrchestrator
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.agent.response_format import parse_agent_response
from app.modules.assistant.conversation_cache import AssistantConversationCache
from app.modules.assistant.profile.schemas import AssistantProfileSnapshot
from app.modules.assistant.profile.service import AssistantProfileService
from app.modules.assistant.repository import AssistantRepository
from app.modules.assistant.schemas import (
    AssistantChatHistoryMessage,
    AssistantChatRequest,
    AssistantConversationCreate,
    AssistantConversationDTO,
    AssistantConversationUpdate,
    AssistantMessageDTO,
)
from app.modules.assistant.service import AssistantService
from app.modules.assistant.skills.registry import SkillRegistry
from app.modules.assistant.usage.recorder import record_llm_usage

if TYPE_CHECKING:
    from app.db.uow import SqlAlchemyUnitOfWork


def _title_from_message(message: str) -> str:
    collapsed = " ".join(message.strip().split())
    if not collapsed:
        return "Nueva conversación"
    if len(collapsed) <= 60:
        return collapsed
    return f"{collapsed[:57]}…"


class AssistantConversationService:
    def __init__(
        self,
        repository: AssistantRepository,
        *,
        provider: LLMProviderPort,
        uow: SqlAlchemyUnitOfWork | None = None,
        profile_service: AssistantProfileService | None = None,
        registry: SkillRegistry | None = None,
        settings: Settings | None = None,
        cache: AssistantConversationCache | None = None,
        lane_queue: ConversationLaneQueue | None = None,
    ) -> None:
        self._repo = repository
        self._provider = provider
        self._assistant = AssistantService(provider=provider)
        self._uow = uow
        self._profile_service = profile_service
        self._registry = registry
        self._settings = settings or get_settings()
        self._cache = cache or AssistantConversationCache(
            build_cache(self._settings),
            self._settings,
        )
        self._lane = lane_queue or ConversationLaneQueue(
            build_cache(self._settings),
            self._settings,
        )

    def _require_conversation(
        self,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> AssistantConversationDTO:
        conversation = self._repo.get_conversation(conversation_id)
        if conversation is None:
            raise NotFoundError("Conversation not found")
        if conversation.restaurant_id != restaurant_id:
            raise ForbiddenError("You do not own this conversation")
        return conversation

    def create_conversation(
        self,
        restaurant_id: uuid.UUID,
        data: AssistantConversationCreate | None = None,
    ) -> AssistantConversationDTO:
        title = (data.title if data and data.title else None) or "Nueva conversación"
        conversation = self._repo.create_conversation(restaurant_id=restaurant_id, title=title)
        self._cache.invalidate_conversation_list(restaurant_id)
        return conversation

    def get_conversation(
        self,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> AssistantConversationDTO:
        return self._require_conversation(restaurant_id, conversation_id)

    def list_conversations(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
    ) -> CursorPage[AssistantConversationDTO]:
        if params.cursor is None:
            cached = self._cache.get_conversation_list(restaurant_id)
            if cached is not None and len(cached) <= params.limit:
                return CursorPage(
                    items=cached[: params.limit],
                    next_cursor=None,
                    has_more=len(cached) > params.limit,
                )

        page = self._repo.list_conversations(restaurant_id, params)
        if params.cursor is None and not page.has_more:
            self._cache.set_conversation_list(restaurant_id, page.items)
        return page

    def list_messages(
        self,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
        params: PaginationParams,
    ) -> CursorPage[AssistantMessageDTO]:
        self._require_conversation(restaurant_id, conversation_id)
        return self._repo.list_messages(conversation_id, params)

    def update_conversation(
        self,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
        data: AssistantConversationUpdate,
    ) -> AssistantConversationDTO:
        self._require_conversation(restaurant_id, conversation_id)
        deleted_at = datetime.now(UTC) if data.is_archived is True else None
        is_active = False if data.is_archived is True else None
        updated = self._repo.update_conversation(
            conversation_id,
            title=data.title,
            is_active=is_active,
            deleted_at=deleted_at,
        )
        if updated is None:
            raise NotFoundError("Conversation not found")
        self._cache.invalidate_conversation(restaurant_id, conversation_id)
        return updated

    def delete_conversation(self, restaurant_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        self._require_conversation(restaurant_id, conversation_id)
        updated = self._repo.update_conversation(
            conversation_id,
            is_active=False,
            deleted_at=datetime.now(UTC),
        )
        if updated is None:
            raise NotFoundError("Conversation not found")
        self._cache.invalidate_conversation(restaurant_id, conversation_id)

    def _load_context_messages(
        self,
        conversation_id: uuid.UUID,
    ) -> list[AssistantChatHistoryMessage]:
        cached = self._cache.get_recent_messages(conversation_id)
        if cached is not None:
            return [
                AssistantChatHistoryMessage(role=item.role, content=item.content)
                for item in cached
            ]

        limit = self._settings.assistant_llm_context_message_limit
        rows = self._repo.list_recent_messages_for_context(conversation_id, limit=limit)
        self._cache.set_recent_messages(conversation_id, rows)
        return [AssistantChatHistoryMessage(role=item.role, content=item.content) for item in rows]

    def stream_chat(
        self,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
        *,
        message: str,
        profile_version: int,
        profile_snapshot: AssistantProfileSnapshot | None = None,
    ) -> Iterator[ChatStreamEvent]:
        if self._profile_service is None:
            raise RuntimeError("Assistant profile service is not configured")

        conversation = self._require_conversation(restaurant_id, conversation_id)
        profile_record, effective_skills = self._profile_service.resolve_profile_for_chat(
            restaurant_id,
            profile_version=profile_version,
            profile_snapshot=profile_snapshot,
        )
        system_prompt = compose_system_prompt(profile_record, effective_skill_ids=effective_skills)

        user_created_at = datetime.now(UTC)
        history = self._load_context_messages(conversation_id)
        self._repo.add_message(
            conversation_id=conversation_id,
            role="user",
            content=message,
            created_at=user_created_at,
        )
        self._cache.invalidate_messages(conversation_id)

        assistant_message_id = uuid.uuid4()
        content_parts: list[str] = []
        request = AssistantChatRequest(message=message, history=history)

        if not self._lane.try_acquire(conversation_id):
            yield ChatStreamEvent(
                event="error",
                data={
                    "code": "conversation_busy",
                    "message": (
                        "Hay otro mensaje procesándose en esta conversación. "
                        "Espera un momento."
                    ),
                },
            )
            return

        try:
            if self._uow is not None and self._registry is not None:
                ctx = AgentContext(
                    restaurant_id=restaurant_id,
                    conversation_id=conversation_id,
                    uow=self._uow,
                    effective_skill_ids=effective_skills,
                )
                orchestrator = AgentOrchestrator(
                    provider=self._provider,
                    registry=self._registry,
                )
                stream = orchestrator.stream_chat(
                    request,
                    profile=profile_record,
                    ctx=ctx,
                    message_id=str(assistant_message_id),
                )
            else:
                stream = self._assistant.stream_chat(
                    request,
                    message_id=str(assistant_message_id),
                    restaurant_id=str(restaurant_id),
                    conversation_id=str(conversation_id),
                    system_prompt=system_prompt,
                )

            for event in stream:
                if event.event == "content.delta":
                    delta = event.data.get("delta")
                    if isinstance(delta, str) and delta:
                        content_parts.append(delta)
                    yield event
                    continue

                if event.event in (
                    "agent.phase",
                    "agent.status",
                    "agent.thought",
                    "agent.plan",
                    "agent.plan_update",
                    "agent.skills",
                ):
                    yield event
                    continue

                if event.event in ("tool.start", "tool.result", "tool.error"):
                    yield event
                    continue

                if event.event == "error":
                    yield event
                    return

                if event.event == "message.complete":
                    provider_content = event.data.get("content")
                    raw_content = (
                        provider_content
                        if isinstance(provider_content, str) and provider_content
                        else "".join(content_parts)
                    )
                    parsed = parse_agent_response(raw_content)
                    final_content = parsed["content"] or raw_content
                    final_reasoning = parsed["reasoning"]
                    if isinstance(event.data.get("reasoning"), str) and event.data["reasoning"]:
                        final_reasoning = str(event.data["reasoning"])

                    usage_payload = event.data.get("usage")
                    compression_payload = event.data.get("context_compression")
                    assistant_metadata = {
                        "effective_skill_ids": effective_skills,
                        "context_compression": compression_payload,
                    }
                    if final_reasoning:
                        assistant_metadata["reasoning"] = final_reasoning
                    self._repo.add_message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=final_content,
                        message_id=assistant_message_id,
                        metadata=assistant_metadata,
                        created_at=datetime.now(UTC),
                    )
                    if self._uow is not None and hasattr(self._uow, "assistant_usage"):
                        usage_data = usage_payload if isinstance(usage_payload, dict) else None
                        record_llm_usage(
                            self._uow.assistant_usage,
                            restaurant_id=restaurant_id,
                            conversation_id=conversation_id,
                            message_id=assistant_message_id,
                            call_type="chat_turn",
                            usage_payload=usage_data,
                            metadata={"context_compression": compression_payload},
                            session=self._uow.session,
                        )

                    title = conversation.title
                    if title == "Nueva conversación":
                        title = _title_from_message(message)

                    self._repo.update_conversation(
                        conversation_id,
                        title=title,
                        last_message_at=datetime.now(UTC),
                    )
                    self._cache.invalidate_conversation(restaurant_id, conversation_id)

                    yield ChatStreamEvent(
                        event="message.complete",
                        data={
                            "conversation_id": str(conversation_id),
                            "message_id": str(assistant_message_id),
                            "content": final_content,
                            "reasoning": final_reasoning,
                        },
                    )
                    return

            if content_parts:
                final_content = "".join(content_parts)
                assistant_metadata = {
                    "effective_skill_ids": effective_skills,
                    "context_compression": None,
                }
                self._repo.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=final_content,
                    message_id=assistant_message_id,
                    metadata=assistant_metadata,
                    created_at=datetime.now(UTC),
                )
                self._repo.update_conversation(conversation_id, last_message_at=datetime.now(UTC))
                self._cache.invalidate_conversation(restaurant_id, conversation_id)
                yield ChatStreamEvent(
                    event="message.complete",
                    data={
                        "conversation_id": str(conversation_id),
                        "message_id": str(assistant_message_id),
                        "content": final_content,
                    },
                )
        finally:
            self._lane.release(conversation_id)
