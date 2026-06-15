# Phase 5 — Redis (hot storage) & cross-cutting concerns — Design

> Status: approved (continuing from Phase 4). Implements Phase 5 of `docs/PROJECT_PLANNING.en.md`.

## 1. Goal

Add Redis-backed **cache**, **idempotency hot path**, and **rate limiting** behind ports
(DIP). Speed up public menu reads, protect public endpoints, and keep DB idempotency as
durable fallback. Graceful degradation when Redis is unavailable (dev without Docker Redis).

## 2. Key decisions

- **CachePort** (`get` / `set` / `delete` / `delete_pattern`) with `RedisCacheAdapter` +
  `NullCacheAdapter` (no-op when `REDIS_URL` unset or connection fails).
- **RateLimiterPort** (fixed-window counter via `INCR` + `EXPIRE`) with `RedisRateLimiterAdapter`
  + permissive `NullRateLimiterAdapter` (always allow) when Redis unavailable.
- **Public menu cache** key: `menu:public:{subdomain}:{locale}`. Locale from query param
  `?locale=` (default `default`); Phase 6 translation will use real locales. Value = JSON
  `FullMenuDTO`.
- **Idempotency**: `CompositeIdempotencyRepository` — read Redis first, fallback DB; write-through
  to both. Key: `idempotency:{key}`. OrderService unchanged (still depends on `IdempotencyRepository`).
- **Cache invalidation**: `MenuCacheService.invalidate_restaurant(restaurant_id)` deletes
  `menu:public:{subdomain}:*` after menu/category/product/promotion mutations (called from
  menu/promotion API handlers after successful writes).
- **Rate limiting**: `RateLimitMiddleware` on `/api/v1/public/*` paths only; key =
  `ratelimit:{client_ip}:{path}`; 429 with uniform error body.
- **Local Redis**: Docker Compose service `redis:7` on port `6379`.
- **Tests**: `fakeredis` for unit/integration tests (no live Redis required in CI).

## 3. TTL strategy

| Data type | Key pattern | TTL | Invalidation |
|-----------|-------------|-----|--------------|
| Public menu | `menu:public:{subdomain}:{locale}` | 300s (5 min) | On menu/category/product/promotion write for restaurant |
| Idempotency (Redis) | `idempotency:{key}` | 86400s (24h, matches DB) | Expires naturally |
| Rate limit | `ratelimit:{ip}:{path}` | window_seconds (60s default) | Expires naturally |

## 4. Module structure

```
backend/app/
  core/
    cache.py              # CachePort + CacheError
    rate_limit.py           # RateLimiterPort
    config.py               # redis_url, TTLs, rate limit settings
  infra/
    redis/
      __init__.py
      cache.py              # RedisCacheAdapter, NullCacheAdapter
      rate_limiter.py       # RedisRateLimiterAdapter, NullRateLimiterAdapter
      composite_idempotency.py  # CompositeIdempotencyRepository
    cache/
      menu_cache.py         # MenuCacheService (get + invalidate)
  middleware/
    rate_limit.py           # RateLimitMiddleware
  modules/public/api.py     # use MenuCacheService for GET menu
  modules/menu/api.py       # invalidate after writes
  modules/promotions/api.py # invalidate after writes
  main.py                   # register RateLimitMiddleware
infra/docker-compose.yml    # add redis service
```

## 5. Settings (new)

- `redis_url: str | None = None` (default `redis://localhost:6379/0` when set in .env)
- `menu_cache_ttl_seconds: int = 300`
- `rate_limit_requests: int = 60`
- `rate_limit_window_seconds: int = 60`

## 6. Testing

- Unit: NullCache, RedisCache with fakeredis, rate limiter allow/deny, composite idempotency
  read-through, menu cache hit/miss, invalidation deletes keys.
- Integration: public menu endpoint serves cached response on second call (fakeredis override).
- Quality gates: pytest, ruff, black, mypy.

## 7. Definition of Done

- CachePort + Redis + Null adapters; MenuCacheService wired to public menu GET.
- CompositeIdempotencyRepository wired in UoW or OrderService deps.
- RateLimitMiddleware on public routes.
- Cache invalidation on menu/promotion writes.
- Redis in docker-compose; fakeredis in tests.
- Commit list for user (no agent commits).
