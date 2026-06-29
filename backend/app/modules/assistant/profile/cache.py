from __future__ import annotations

import logging
import uuid

from app.core.cache import CachePort
from app.core.config import Settings, get_settings
from app.modules.assistant.profile.schemas import AssistantProfileRecord

logger = logging.getLogger(__name__)


def _profile_key(restaurant_id: uuid.UUID) -> str:
    return f"assistant:profile:{restaurant_id}"


class AssistantProfileCache:
    def __init__(self, cache: CachePort, settings: Settings | None = None) -> None:
        self._cache = cache
        self._ttl = (settings or get_settings()).assistant_profile_cache_ttl_seconds

    def get(self, restaurant_id: uuid.UUID) -> AssistantProfileRecord | None:
        raw = self._cache.get(_profile_key(restaurant_id))
        if raw is None:
            return None
        try:
            return AssistantProfileRecord.model_validate_json(raw)
        except Exception:
            logger.warning("assistant profile cache corrupt restaurant_id=%s", restaurant_id)
            self.invalidate(restaurant_id)
            return None

    def set(self, restaurant_id: uuid.UUID, record: AssistantProfileRecord) -> None:
        self._cache.set(_profile_key(restaurant_id), record.model_dump_json(), self._ttl)

    def invalidate(self, restaurant_id: uuid.UUID) -> None:
        self._cache.delete(_profile_key(restaurant_id))
