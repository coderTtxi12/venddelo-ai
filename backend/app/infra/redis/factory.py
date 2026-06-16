import logging
from functools import lru_cache

from app.core.cache import CachePort
from app.core.config import Settings, get_settings
from app.core.rate_limit import RateLimiterPort
from app.infra.redis.cache import NullCacheAdapter, RedisCacheAdapter
from app.infra.redis.rate_limiter import NullRateLimiterAdapter, RedisRateLimiterAdapter

logger = logging.getLogger(__name__)


@lru_cache
def _redis_cache(url: str) -> CachePort:
    return RedisCacheAdapter.from_url(url)


@lru_cache
def _redis_rate_limiter(url: str) -> RateLimiterPort:
    return RedisRateLimiterAdapter.from_url(url)


def build_cache(settings: Settings | None = None) -> CachePort:
    cfg = settings or get_settings()
    if not cfg.redis_url:
        logger.info("redis cache disabled: REDIS_URL not configured")
        return NullCacheAdapter()
    try:
        return _redis_cache(cfg.redis_url)
    except Exception:
        logger.warning("redis cache unavailable, using null adapter", exc_info=True)
        return NullCacheAdapter()


def build_rate_limiter(settings: Settings | None = None) -> RateLimiterPort:
    cfg = settings or get_settings()
    if not cfg.redis_url:
        logger.info("redis rate limiter disabled: REDIS_URL not configured")
        return NullRateLimiterAdapter()
    try:
        return _redis_rate_limiter(cfg.redis_url)
    except Exception:
        logger.warning("redis rate limiter unavailable, using null adapter", exc_info=True)
        return NullRateLimiterAdapter()
