from __future__ import annotations

from typing import cast

from redis import Redis

from app.core.cache import CachePort


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
        return cast(str | None, self._client.get(key))

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        self._client.set(key, value, ex=ttl_seconds)

    def delete(self, key: str) -> None:
        self._client.delete(key)

    def delete_pattern(self, pattern: str) -> int:
        count = 0
        for key in self._client.scan_iter(match=pattern):
            self._client.delete(key)
            count += 1
        return count
