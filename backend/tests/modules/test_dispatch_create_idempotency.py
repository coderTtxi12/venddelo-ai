import uuid

from app.modules.delivery_dispatch.create_idempotency import (
    dispatch_idempotency_storage_key,
    hash_dispatch_create,
    normalize_idempotency_key,
)
from app.modules.delivery_dispatch.schemas import DispatchRequestCreate


def _payload(**overrides) -> DispatchRequestCreate:
    data = {
        "customer_name": "María López",
        "customer_phone": "+525512345678",
        "dropoff_lat": 19.4,
        "dropoff_lng": -99.1,
        "dropoff_address": "Centro",
        "payment_method": "cash",
        "collect_cents": 25000,
        "cash_denomination_cents": 50000,
        "package_size": "normal",
        "package_count": 1,
        "prep_minutes": 5,
    }
    data.update(overrides)
    return DispatchRequestCreate.model_validate(data)


def test_normalize_idempotency_key_trims_and_rejects_blank():
    assert normalize_idempotency_key("  abc  ") == "abc"
    assert normalize_idempotency_key("   ") is None
    assert normalize_idempotency_key(None) is None


def test_hash_dispatch_create_changes_with_payload_or_restaurant():
    restaurant_a = uuid.uuid4()
    restaurant_b = uuid.uuid4()
    same = _payload()
    other = _payload(customer_name="Otro")

    assert hash_dispatch_create(restaurant_a, same) == hash_dispatch_create(restaurant_a, same)
    assert hash_dispatch_create(restaurant_a, same) != hash_dispatch_create(restaurant_a, other)
    assert hash_dispatch_create(restaurant_a, same) != hash_dispatch_create(restaurant_b, same)


def test_storage_key_is_scoped_to_restaurant():
    restaurant_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    assert dispatch_idempotency_storage_key(restaurant_id, "k1") == (
        "dispatch:11111111-1111-1111-1111-111111111111:k1"
    )
