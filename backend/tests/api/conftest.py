import uuid
from collections.abc import Iterator
from unittest.mock import patch

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.api import cache_helpers
from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db import uow as uow_module
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.ai.stub_gateway import StubAIGateway
from app.infra.redis import factory as redis_factory
from app.infra.redis.cache import RedisCacheAdapter
from app.infra.redis.rate_limiter import RedisRateLimiterAdapter
from app.main import app
from app.modules.public import api as public_api
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")


class FakeAuth(AuthPort):
    def verify_token(self, token: str) -> AuthenticatedUser:
        return AuthenticatedUser(id=OWNER, email="test@example.com")


@requires_db
@pytest.fixture
def client(engine):
    """API client with isolated fakeredis (avoids stale idempotency keys)."""
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    redis_client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(redis_client)
    limiter = RedisRateLimiterAdapter(redis_client)

    def override_uow() -> Iterator[SqlAlchemyUnitOfWork]:
        with SqlAlchemyUnitOfWork(factory) as uow:
            yield uow
            uow.commit()

    def fake_build_cache(settings=None):
        return cache

    def fake_build_rate_limiter(settings=None):
        return limiter

    def fake_build_ai_gateway(settings=None):
        return StubAIGateway()

    patches = [
        patch.object(uow_module, "build_cache", fake_build_cache),
        patch.object(cache_helpers, "build_cache", fake_build_cache),
        patch.object(public_api, "build_cache", fake_build_cache),
        patch.object(public_api, "build_ai_gateway", fake_build_ai_gateway),
        patch.object(redis_factory, "build_cache", fake_build_cache),
        patch.object(redis_factory, "build_rate_limiter", fake_build_rate_limiter),
    ]

    app.dependency_overrides[get_uow] = override_uow
    app.dependency_overrides[get_auth] = lambda: FakeAuth()
    for p in patches:
        p.start()
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        for p in patches:
            p.stop()
        app.dependency_overrides.clear()
