from datetime import UTC, datetime, timedelta

from app.infra.repositories.idempotency import SqlAlchemyIdempotencyRepository
from tests.conftest import requires_db


@requires_db
def test_put_then_get(session):
    repo = SqlAlchemyIdempotencyRepository(session)
    rec = repo.put("k1", "hash1", {"ok": True}, ttl_seconds=60)
    assert rec.key == "k1"
    got = repo.get("k1")
    assert got is not None
    assert got.response_snapshot == {"ok": True}


@requires_db
def test_get_missing(session):
    repo = SqlAlchemyIdempotencyRepository(session)
    assert repo.get("nope") is None


@requires_db
def test_purge_expired(session):
    repo = SqlAlchemyIdempotencyRepository(session)
    repo.put("fresh", "h", None, ttl_seconds=3600)
    repo.put("stale", "h", None, ttl_seconds=-10)
    removed = repo.purge_expired(datetime.now(UTC) + timedelta(seconds=1))
    assert removed >= 1
    assert repo.get("stale") is None
    assert repo.get("fresh") is not None
