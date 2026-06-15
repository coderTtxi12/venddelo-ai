import fakeredis

from app.infra.redis.cache import RedisCacheAdapter
from app.infra.redis.rate_limiter import RedisRateLimiterAdapter


def test_redis_cache_set_get_delete():
    client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(client)
    cache.set("k1", "v1", 60)
    assert cache.get("k1") == "v1"
    cache.delete("k1")
    assert cache.get("k1") is None


def test_redis_cache_delete_pattern():
    client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(client)
    cache.set("menu:public:sub:default", "{}", 60)
    cache.set("menu:public:sub:en", "{}", 60)
    removed = cache.delete_pattern("menu:public:sub:*")
    assert removed == 2
    assert cache.get("menu:public:sub:default") is None


def test_rate_limiter_blocks_over_limit():
    client = fakeredis.FakeRedis(decode_responses=True)
    limiter = RedisRateLimiterAdapter(client)
    key = "ratelimit:test"
    assert limiter.is_allowed(key, limit=2, window_seconds=60)
    assert limiter.is_allowed(key, limit=2, window_seconds=60)
    assert not limiter.is_allowed(key, limit=2, window_seconds=60)
