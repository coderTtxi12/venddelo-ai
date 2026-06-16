from __future__ import annotations

import logging
from typing import cast

from redis import Redis

from app.core.cache import CachePort

logger = logging.getLogger(__name__)


class NullCacheAdapter(CachePort):
    """No-op cache used when Redis is not configured."""

    def get(self, key: str) -> str | None:
        return None

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        pass

    def delete(self, key: str) -> None:
        pass

    def delete_pattern(self, pattern: str) -> int:
        return 0


class RedisCacheAdapter(CachePort):
    def __init__(self, client: Redis) -> None:
        self._client = client

    @classmethod
    def from_url(cls, url: str) -> RedisCacheAdapter:
        return cls(Redis.from_url(url, decode_responses=True))

    def get(self, key: str) -> str | None:
        value = cast(str | None, self._client.get(key))
        logger.debug(
            "redis cache get key=%s result=%s",
            key,
            "hit" if value is not None else "miss",
        )
        return value

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        self._client.set(key, value, ex=ttl_seconds)
        logger.debug("redis cache set key=%s ttl_seconds=%s", key, ttl_seconds)

    def delete(self, key: str) -> None:
        self._client.delete(key)
        logger.debug("redis cache delete key=%s", key)

    def delete_pattern(self, pattern: str) -> int:
        count = 0
        for key in self._client.scan_iter(match=pattern):
            self._client.delete(key)
            count += 1
        logger.debug("redis cache delete_pattern pattern=%s removed=%s", pattern, count)
        return count
