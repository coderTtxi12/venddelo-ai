from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from app.core.cache import CachePort
from app.core.config import Settings, get_settings
from app.core.exceptions import ConflictError


def _lane_key(conversation_id: uuid.UUID) -> str:
    return f"assistant:lane:{conversation_id}"


class ConversationLaneQueue:
    """One in-flight agent turn per conversation (Cloud Run safe via Redis SET NX)."""

    def __init__(self, cache: CachePort, settings: Settings | None = None) -> None:
        self._cache = cache
        self._ttl = (settings or get_settings()).assistant_lane_lock_ttl_seconds

    def try_acquire(self, conversation_id: uuid.UUID) -> bool:
        return self._cache.set_nx(_lane_key(conversation_id), "1", self._ttl)

    def release(self, conversation_id: uuid.UUID) -> None:
        self._cache.delete(_lane_key(conversation_id))

    @contextmanager
    def hold(self, conversation_id: uuid.UUID) -> Iterator[None]:
        if not self.try_acquire(conversation_id):
            raise ConflictError("Another message is still processing for this conversation")
        try:
            yield
        finally:
            self.release(conversation_id)
