import uuid

import pytest
from cryptography.fernet import Fernet

from app.db.models.marketing import MarketingAgentAccount
from app.db.models.restaurant import Restaurant
from app.modules.marketing.adapters import SqlAlchemyMarketingRepository
from app.modules.marketing.crypto import MarketingCrypto
from app.modules.marketing.service import MarketingService
from tests.conftest import requires_db


@requires_db
def test_enqueue_assigns_first_active_agent(session):
    crypto = MarketingCrypto(Fernet.generate_key().decode())
    restaurant = Restaurant(name="R", subdomain=f"r-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    agent = MarketingAgentAccount(
        label="a1",
        fb_email_encrypted=crypto.encrypt_str("a@x.com"),
        fb_password_encrypted=crypto.encrypt_str("secret"),
        status="active",
    )
    session.add(agent)
    session.flush()

    service = MarketingService(SqlAlchemyMarketingRepository(session))
    queued = service.enqueue_facebook_post(restaurant.id, "Hola feed")
    assert queued.status == "queued"
    task = service.get_task(restaurant.id, queued.task_id)
    assert task.status == "queued"
    assert task.error is None


@requires_db
def test_enqueue_fails_without_active_agent(session):
    from app.core.exceptions import NotFoundError

    restaurant = Restaurant(name="R2", subdomain=f"r-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    service = MarketingService(SqlAlchemyMarketingRepository(session))
    with pytest.raises(NotFoundError):
        service.enqueue_facebook_post(restaurant.id, "x")
