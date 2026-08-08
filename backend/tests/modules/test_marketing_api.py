import asyncio
import uuid
from functools import wraps

from cryptography.fernet import Fernet
from sqlalchemy.orm import sessionmaker

from app.db.models.marketing import MarketingAgentAccount
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.marketing.adapters import SqlAlchemyMarketingRepository
from app.modules.marketing.crypto import MarketingCrypto
from app.modules.marketing.worker import (
    PublishResult,
    run_marketing_facebook_post_task,
)
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
AUTH = {"Authorization": "Bearer valid-token"}


def async_test(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))

    return wrapper


class FakeFacebookFeedPublisher:
    def __init__(self, result: PublishResult) -> None:
        self._result = result
        self.calls: list[dict[str, object]] = []

    async def publish(
        self,
        *,
        email: str,
        password: str,
        storage_state: dict[str, object] | None,
        message: str,
    ) -> PublishResult:
        self.calls.append(
            {
                "email": email,
                "password": password,
                "storage_state": storage_state,
                "message": message,
            }
        )
        return self._result


def _seed_restaurant_and_agent(uow: SqlAlchemyUnitOfWork, crypto: MarketingCrypto):
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Marketing", subdomain=f"mkt-{uuid.uuid4().hex[:8]}"),
        owner_id=OWNER,
    )
    agent = MarketingAgentAccount(
        label="test-agent",
        fb_email_encrypted=crypto.encrypt_str("agent@example.com"),
        fb_password_encrypted=crypto.encrypt_str("secret-pass"),
        status="active",
    )
    uow.session.add(agent)
    uow.session.flush()
    return restaurant, agent


def test_marketing_router_paths():
    from app.modules.marketing.api import router

    paths = [getattr(route, "path", None) for route in router.routes]
    assert "/restaurants/{restaurant_id}/marketing/facebook/posts" in paths
    assert "/restaurants/{restaurant_id}/marketing/tasks/{task_id}" in paths


@requires_db
def test_create_facebook_post_returns_202(engine, monkeypatch):
    from collections.abc import Iterator
    from unittest.mock import patch

    import fakeredis
    from fastapi.testclient import TestClient

    from app.api import cache_helpers
    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.db import uow as uow_module
    from app.db.uow import get_uow
    from app.infra.redis import factory as redis_factory
    from app.infra.redis.cache import RedisCacheAdapter
    from app.infra.redis.rate_limiter import RedisRateLimiterAdapter
    from app.main import app
    from app.modules.public import api as public_api

    class FakeAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=OWNER, email="test@example.com")

    key = Fernet.generate_key().decode()
    monkeypatch.setenv("MARKETING_AGENT_FERNET_KEY", key)
    from app.core.config import get_settings

    get_settings.cache_clear()

    crypto = MarketingCrypto(key)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant, _agent = _seed_restaurant_and_agent(uow, crypto)
        uow.commit()

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

    patches = [
        patch.object(uow_module, "build_cache", fake_build_cache),
        patch.object(cache_helpers, "build_cache", fake_build_cache),
        patch.object(public_api, "build_cache", fake_build_cache),
        patch.object(redis_factory, "build_cache", fake_build_cache),
        patch.object(redis_factory, "build_rate_limiter", fake_build_rate_limiter),
    ]

    app.dependency_overrides[get_uow] = override_uow
    app.dependency_overrides[get_auth] = lambda: FakeAuth()
    for p in patches:
        p.start()
    try:
        with TestClient(app) as client:
            resp = client.post(
                f"/api/v1/restaurants/{restaurant.id}/marketing/facebook/posts",
                json={"message": "Hola feed"},
                headers=AUTH,
            )
            assert resp.status_code == 202
            body = resp.json()
            assert body["status"] == "queued"
            assert body["task_id"]

            get_resp = client.get(
                f"/api/v1/restaurants/{restaurant.id}/marketing/tasks/{body['task_id']}",
                headers=AUTH,
            )
            assert get_resp.status_code == 200
            assert get_resp.json()["status"] in (
                "queued",
                "running",
                "failed",
                "succeeded",
            )
    finally:
        for p in patches:
            p.stop()
        app.dependency_overrides.clear()


@requires_db
@async_test
async def test_worker_stub_publisher_marks_task_failed(session, engine, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("MARKETING_AGENT_FERNET_KEY", key)
    from app.core.config import get_settings

    get_settings.cache_clear()

    crypto = MarketingCrypto(key)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant, agent = _seed_restaurant_and_agent(uow, crypto)
        repo = SqlAlchemyMarketingRepository(uow.session)
        task = repo.create_task(
            restaurant_id=restaurant.id,
            agent_id=agent.id,
            message="Worker test",
        )
        task_id = task.id
        uow.commit()

    await run_marketing_facebook_post_task(
        task_id,
        uow_factory=lambda: SqlAlchemyUnitOfWork(factory),
    )

    with SqlAlchemyUnitOfWork(factory) as uow:
        finished = uow.marketing.get_task_by_id(task_id)
        assert finished is not None
        assert finished.status == "failed"
        assert finished.error == "publisher not wired"


@requires_db
@async_test
async def test_worker_success_persists_storage_state(session, engine, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("MARKETING_AGENT_FERNET_KEY", key)
    from app.core.config import get_settings

    get_settings.cache_clear()

    crypto = MarketingCrypto(key)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant, agent = _seed_restaurant_and_agent(uow, crypto)
        repo = SqlAlchemyMarketingRepository(uow.session)
        task = repo.create_task(
            restaurant_id=restaurant.id,
            agent_id=agent.id,
            message="Success path",
        )
        task_id = task.id
        uow.commit()

    new_state = {"cookies": [{"name": "c", "value": "1"}], "origins": []}
    publisher = FakeFacebookFeedPublisher(
        PublishResult(ok=True, storage_state=new_state, result={"post_id": "123"})
    )

    await run_marketing_facebook_post_task(
        task_id,
        publisher=publisher,
        uow_factory=lambda: SqlAlchemyUnitOfWork(factory),
    )

    with SqlAlchemyUnitOfWork(factory) as uow:
        finished = uow.marketing.get_task_by_id(task_id)
        assert finished is not None
        assert finished.status == "succeeded"
        assert finished.result == {"post_id": "123"}

        updated_agent = uow.marketing.get_agent(agent.id)
        assert updated_agent is not None
        assert updated_agent.storage_state_encrypted is not None
        assert crypto.decrypt_json(updated_agent.storage_state_encrypted) == new_state

    assert publisher.calls[0]["message"] == "Success path"
    assert publisher.calls[0]["password"] == "secret-pass"
