from __future__ import annotations

import json
import logging
import uuid

from app.core.cache import CachePort
from app.core.config import Settings, get_settings
from app.modules.assistant.schemas import AssistantConversationDTO, AssistantMessageDTO

logger = logging.getLogger(__name__)


def _conversation_list_key(restaurant_id: uuid.UUID) -> str:
    return f"assistant:conv-list:{restaurant_id}"


def _conversation_messages_key(conversation_id: uuid.UUID) -> str:
    return f"assistant:conv-msgs:{conversation_id}"


class AssistantConversationCache:
    def __init__(self, cache: CachePort, settings: Settings | None = None) -> None:
        self._cache = cache
        self._ttl = (settings or get_settings()).assistant_conversation_cache_ttl_seconds

    def get_conversation_list(self, restaurant_id: uuid.UUID) -> list[AssistantConversationDTO] | None:
        raw = self._cache.get(_conversation_list_key(restaurant_id))
        if raw is None:
            return None
        try:
            payload = json.loads(raw)
            return [AssistantConversationDTO.model_validate(item) for item in payload]
        except Exception:
            logger.warning("assistant conversation list cache corrupt restaurant_id=%s", restaurant_id)
            self.invalidate_conversation_list(restaurant_id)
            return None

    def set_conversation_list(
        self,
        restaurant_id: uuid.UUID,
        items: list[AssistantConversationDTO],
    ) -> None:
        encoded = json.dumps([item.model_dump(mode="json") for item in items])
        self._cache.set(_conversation_list_key(restaurant_id), encoded, self._ttl)

    def invalidate_conversation_list(self, restaurant_id: uuid.UUID) -> None:
        self._cache.delete(_conversation_list_key(restaurant_id))

    def get_recent_messages(self, conversation_id: uuid.UUID) -> list[AssistantMessageDTO] | None:
        raw = self._cache.get(_conversation_messages_key(conversation_id))
        if raw is None:
            return None
        try:
            payload = json.loads(raw)
            return [AssistantMessageDTO.model_validate(item) for item in payload]
        except Exception:
            logger.warning("assistant messages cache corrupt conversation_id=%s", conversation_id)
            self.invalidate_messages(conversation_id)
            return None

    def set_recent_messages(
        self,
        conversation_id: uuid.UUID,
        items: list[AssistantMessageDTO],
    ) -> None:
        encoded = json.dumps([item.model_dump(mode="json") for item in items])
        self._cache.set(_conversation_messages_key(conversation_id), encoded, self._ttl)

    def invalidate_messages(self, conversation_id: uuid.UUID) -> None:
        self._cache.delete(_conversation_messages_key(conversation_id))

    def invalidate_conversation(self, restaurant_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        self.invalidate_conversation_list(restaurant_id)
        self.invalidate_messages(conversation_id)
