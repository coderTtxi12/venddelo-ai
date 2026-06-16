from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.core.cache import CachePort
from app.core.idempotency import IdempotencyRecord, IdempotencyRepository

logger = logging.getLogger(__name__)


class CompositeIdempotencyRepository(IdempotencyRepository):
    """Redis hot path with durable DB fallback."""

    def __init__(
        self,
        cache: CachePort,
        db: IdempotencyRepository,
        *,
        redis_ttl_seconds: int,
        key_prefix: str = "idempotency:",
    ) -> None:
        self._cache = cache
        self._db = db
        self._redis_ttl = redis_ttl_seconds
        self._prefix = key_prefix

    def _cache_key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    def _serialize(self, record: IdempotencyRecord) -> str:
        return record.model_dump_json()

    def _deserialize(self, raw: str) -> IdempotencyRecord:
        return IdempotencyRecord.model_validate_json(raw)

    def get(self, key: str) -> IdempotencyRecord | None:
        cache_key = self._cache_key(key)
        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.info("idempotency redis hit key=%s", key)
            return self._deserialize(cached)
        record = self._db.get(key)
        if record is not None:
            logger.info("idempotency db hit backfill key=%s", key)
            self._cache.set(cache_key, self._serialize(record), self._redis_ttl)
        return record

    def put(
        self,
        key: str,
        request_hash: str,
        response: dict[str, Any] | None,
        ttl_seconds: int,
    ) -> IdempotencyRecord:
        record = self._db.put(key, request_hash, response, ttl_seconds)
        cache_ttl = min(ttl_seconds, self._redis_ttl)
        self._cache.set(self._cache_key(key), self._serialize(record), cache_ttl)
        logger.info("idempotency stored key=%s ttl_seconds=%s", key, cache_ttl)
        return record

    def purge_expired(self, now: datetime | None = None) -> int:
        return self._db.purge_expired(now)
