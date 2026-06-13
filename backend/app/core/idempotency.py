from typing import Protocol, runtime_checkable


class IdempotencyKey(str):
    """Opaque idempotency key supplied via the Idempotency-Key header."""


@runtime_checkable
class IdempotencyStore(Protocol):
    """Contract for persisting idempotency keys + cached responses.

    Concrete implementations (Redis/DB) arrive in later phases.
    """

    def get(self, key: IdempotencyKey) -> dict[str, object] | None: ...

    def put(self, key: IdempotencyKey, response: dict[str, object], ttl_seconds: int) -> None: ...
