from __future__ import annotations

from typing import cast

from redis import Redis

from app.core.rate_limit import RateLimiterPort


class NullRateLimiterAdapter(RateLimiterPort):
    """Always allow when Redis is not configured."""

    def is_allowed(self, key: str, *, limit: int, window_seconds: int) -> bool:
        return True

    def remaining(self, key: str, *, limit: int, window_seconds: int) -> int:
        return limit


class RedisRateLimiterAdapter(RateLimiterPort):
    def __init__(self, client: Redis) -> None:
        self._client = client

    @classmethod
    def from_url(cls, url: str) -> RedisRateLimiterAdapter:
        return cls(Redis.from_url(url, decode_responses=True))

    def is_allowed(self, key: str, *, limit: int, window_seconds: int) -> bool:
        pipe = self._client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        count, _ = cast(tuple[int, bool], pipe.execute())  # type: ignore[no-untyped-call]
        return int(count) <= limit

    def remaining(self, key: str, *, limit: int, window_seconds: int) -> int:
        raw = cast(str | None, self._client.get(key))
        current = int(raw) if raw else 0
        return max(0, limit - current)
