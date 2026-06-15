from datetime import UTC, datetime, timedelta

import fakeredis

from app.core.idempotency import IdempotencyRecord
from app.infra.redis.cache import RedisCacheAdapter
from app.infra.redis.composite_idempotency import CompositeIdempotencyRepository


class FakeDbIdempotency:
    def __init__(self) -> None:
        self.store: dict[str, IdempotencyRecord] = {}
        self.get_calls = 0

    def get(self, key: str) -> IdempotencyRecord | None:
        self.get_calls += 1
        return self.store.get(key)

    def put(self, key, request_hash, response, ttl_seconds):
        now = datetime.now(UTC)
        record = IdempotencyRecord(
            key=key,
            request_hash=request_hash,
            response_snapshot=response,
            created_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        self.store[key] = record
        return record

    def purge_expired(self, now=None):
        return 0


def test_composite_reads_redis_before_db():
    client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(client)
    db = FakeDbIdempotency()
    composite = CompositeIdempotencyRepository(cache, db, redis_ttl_seconds=3600)

    record = IdempotencyRecord(
        key="k1",
        request_hash="h1",
        response_snapshot={"ok": True},
        created_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    cache.set("idempotency:k1", record.model_dump_json(), 3600)

    got = composite.get("k1")
    assert got is not None
    assert got.key == "k1"
    assert db.get_calls == 0


def test_composite_populates_redis_on_db_hit():
    client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(client)
    db = FakeDbIdempotency()
    composite = CompositeIdempotencyRepository(cache, db, redis_ttl_seconds=3600)

    db.put("k2", "h2", {"x": 1}, 3600)
    composite.get("k2")
    assert cache.get("idempotency:k2") is not None
