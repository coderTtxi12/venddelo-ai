import asyncio
import uuid
from functools import wraps

from cryptography.fernet import Fernet
from sqlalchemy.orm import sessionmaker

from app.db.models.marketing import MarketingAgentAccount
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.marketing.adapters import SqlAlchemyMarketingRepository
from app.modules.marketing.browser.publisher import PublishResult
from app.modules.marketing.crypto import MarketingCrypto
from app.modules.marketing.worker import run_marketing_facebook_post_task
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")


def async_test(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))

    return wrapper


class FakeFacebookFeedPublisher:
    def __init__(
        self,
        result: PublishResult | None = None,
        *,
        raise_exc: BaseException | None = None,
    ) -> None:
        self._result = result
        self._raise_exc = raise_exc
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
        if self._raise_exc is not None:
            raise self._raise_exc
        assert self._result is not None
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

    from app.modules.marketing.browser.publisher import StubFacebookFeedPublisher

    await run_marketing_facebook_post_task(
        task_id,
        publisher=StubFacebookFeedPublisher(),
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


@requires_db
@async_test
async def test_worker_publisher_exception_marks_task_failed(
    session, engine, monkeypatch
):
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
            message="Exception path",
        )
        task_id = task.id
        uow.commit()

    publisher = FakeFacebookFeedPublisher(
        raise_exc=RuntimeError("Playwright connection lost")
    )

    await run_marketing_facebook_post_task(
        task_id,
        publisher=publisher,
        uow_factory=lambda: SqlAlchemyUnitOfWork(factory),
    )

    with SqlAlchemyUnitOfWork(factory) as uow:
        finished = uow.marketing.get_task_by_id(task_id)
        assert finished is not None
        assert finished.status == "failed"
        assert finished.error == "Playwright connection lost"
        assert "secret-pass" not in (finished.error or "")
        assert "agent@example.com" not in (finished.error or "")


@requires_db
@async_test
async def test_worker_decrypt_failure_marks_task_failed(session, engine, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("MARKETING_AGENT_FERNET_KEY", key)
    from app.core.config import get_settings

    get_settings.cache_clear()

    crypto = MarketingCrypto(key)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant, agent = _seed_restaurant_and_agent(uow, crypto)
        agent.fb_password_encrypted = "not-valid-ciphertext"
        repo = SqlAlchemyMarketingRepository(uow.session)
        task = repo.create_task(
            restaurant_id=restaurant.id,
            agent_id=agent.id,
            message="Decrypt fail",
        )
        task_id = task.id
        uow.commit()

    publisher = FakeFacebookFeedPublisher(
        PublishResult(ok=True, storage_state={"cookies": [], "origins": []})
    )

    await run_marketing_facebook_post_task(
        task_id,
        publisher=publisher,
        uow_factory=lambda: SqlAlchemyUnitOfWork(factory),
    )

    with SqlAlchemyUnitOfWork(factory) as uow:
        finished = uow.marketing.get_task_by_id(task_id)
        assert finished is not None
        assert finished.status == "failed"
        assert finished.error == "Failed to decrypt agent credentials"

    assert publisher.calls == []


@requires_db
@async_test
async def test_worker_manual_intervention_persists_storage_state(
    session, engine, monkeypatch
):
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
            message="Checkpoint path",
        )
        task_id = task.id
        uow.commit()

    new_state = {"cookies": [{"name": "checkpoint", "value": "1"}], "origins": []}
    publisher = FakeFacebookFeedPublisher(
        PublishResult(
            ok=False,
            needs_manual_intervention=True,
            storage_state=new_state,
            error="Facebook checkpoint",
        )
    )

    await run_marketing_facebook_post_task(
        task_id,
        publisher=publisher,
        uow_factory=lambda: SqlAlchemyUnitOfWork(factory),
    )

    with SqlAlchemyUnitOfWork(factory) as uow:
        finished = uow.marketing.get_task_by_id(task_id)
        assert finished is not None
        assert finished.status == "failed"
        assert finished.error == "Facebook checkpoint"

        updated_agent = uow.marketing.get_agent(agent.id)
        assert updated_agent is not None
        assert updated_agent.status == "needs_manual_intervention"
        assert updated_agent.storage_state_encrypted is not None
        assert crypto.decrypt_json(updated_agent.storage_state_encrypted) == new_state


@requires_db
@async_test
async def test_worker_failure_persists_storage_state(session, engine, monkeypatch):
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
            message="Failure path",
        )
        task_id = task.id
        uow.commit()

    new_state = {"cookies": [{"name": "partial", "value": "1"}], "origins": []}
    publisher = FakeFacebookFeedPublisher(
        PublishResult(
            ok=False,
            needs_manual_intervention=False,
            storage_state=new_state,
            error="Publish failed",
        )
    )

    await run_marketing_facebook_post_task(
        task_id,
        publisher=publisher,
        uow_factory=lambda: SqlAlchemyUnitOfWork(factory),
    )

    with SqlAlchemyUnitOfWork(factory) as uow:
        finished = uow.marketing.get_task_by_id(task_id)
        assert finished is not None
        assert finished.status == "failed"
        assert finished.error == "Publish failed"

        updated_agent = uow.marketing.get_agent(agent.id)
        assert updated_agent is not None
        assert updated_agent.status == "active"
        assert updated_agent.storage_state_encrypted is not None
        assert crypto.decrypt_json(updated_agent.storage_state_encrypted) == new_state
