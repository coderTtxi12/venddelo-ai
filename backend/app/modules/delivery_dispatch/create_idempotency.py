from __future__ import annotations

import hashlib
import json
import uuid

from app.modules.delivery_dispatch.schemas import DispatchRequestCreate


def normalize_idempotency_key(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def dispatch_idempotency_storage_key(restaurant_id: uuid.UUID, key: str) -> str:
    return f"dispatch:{restaurant_id}:{key}"


def hash_dispatch_create(restaurant_id: uuid.UUID, data: DispatchRequestCreate) -> str:
    payload = json.dumps(
        {"restaurant_id": str(restaurant_id), **data.model_dump(mode="json")},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()
