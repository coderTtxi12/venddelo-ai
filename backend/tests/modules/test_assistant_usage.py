from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.usage.pricing_catalog import compute_llm_cost_usd
from app.modules.assistant.usage.recorder import record_llm_usage
from app.modules.assistant.usage.schemas import LLMUsageCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def test_pricing_catalog_zero_for_stub_and_unknown_models():
    assert compute_llm_cost_usd("stub", 1000, 1000) == Decimal("0")
    assert compute_llm_cost_usd("unknown-model", 1000, 1000) == Decimal("0")


def test_pricing_catalog_computes_known_model_cost():
    assert compute_llm_cost_usd("gpt-4o-mini", 1000, 1000) == Decimal("0.000750")


@requires_db
def test_usage_repository_records_and_summarizes_by_restaurant(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(RestaurantCreate(name="Usage", subdomain="usage"))

    uow.assistant_usage.insert(
        LLMUsageCreate(
            restaurant_id=restaurant.id,
            conversation_id=None,
            message_id=None,
            call_type="chat_turn",
            provider="stub",
            model="stub",
            input_tokens=10,
            output_tokens=20,
            cost_usd=Decimal("0"),
            metadata={"source": "test"},
        )
    )
    uow.assistant_usage.insert(
        LLMUsageCreate(
            restaurant_id=restaurant.id,
            conversation_id=None,
            message_id=None,
            call_type="context_compression",
            provider="stub",
            model="stub",
            input_tokens=5,
            output_tokens=5,
            cost_usd=Decimal("0"),
        )
    )

    summary = uow.assistant_usage.summarize(restaurant.id)

    assert summary.calls == 2
    assert summary.input_tokens == 15
    assert summary.output_tokens == 25
    assert summary.total_tokens == 40
    assert summary.cost_usd == Decimal("0.000000")
    assert {item.call_type for item in summary.by_call_type} == {
        "chat_turn",
        "context_compression",
    }


def test_record_llm_usage_uses_savepoint_and_does_not_raise_on_insert_failure():
    repository = MagicMock()
    repository.insert.side_effect = RuntimeError("table missing")
    session = MagicMock()
    nested = MagicMock()
    session.begin_nested.return_value.__enter__ = MagicMock(return_value=nested)
    session.begin_nested.return_value.__exit__ = MagicMock(return_value=False)

    record_llm_usage(
        repository,
        restaurant_id=uuid4(),
        conversation_id=uuid4(),
        message_id=uuid4(),
        call_type="chat_turn",
        usage_payload={
            "provider": "stub",
            "model": "stub",
            "input_tokens": 10,
            "output_tokens": 5,
        },
        session=session,
    )

    session.begin_nested.assert_called_once()
    repository.insert.assert_called_once()
