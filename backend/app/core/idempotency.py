from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict


class IdempotencyKey(str):
    """Opaque idempotency key supplied via the Idempotency-Key header."""


@runtime_checkable
class IdempotencyStore(Protocol):
    """Contract for persisting idempotency keys + cached responses.

    Concrete implementations (Redis/DB) arrive in later phases.
    """

    def get(self, key: IdempotencyKey) -> dict[str, object] | None: ...

    def put(self, key: IdempotencyKey, response: dict[str, object], ttl_seconds: int) -> None: ...


class IdempotencyRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    request_hash: str
    response_snapshot: dict[str, Any] | None = None
    created_at: datetime
    expires_at: datetime


class IdempotencyRepository(ABC):
    @abstractmethod
    def get(self, key: str) -> IdempotencyRecord | None: ...

    @abstractmethod
    def put(
        self,
        key: str,
        request_hash: str,
        response: dict[str, Any] | None,
        ttl_seconds: int,
    ) -> IdempotencyRecord: ...

    @abstractmethod
    def purge_expired(self, now: datetime | None = None) -> int: ...
