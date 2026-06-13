from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.idempotency import IdempotencyRecord, IdempotencyRepository
from app.db.models.system import IdempotencyKey as IdempotencyKeyModel


class SqlAlchemyIdempotencyRepository(IdempotencyRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, key: str) -> IdempotencyRecord | None:
        obj = self._session.get(IdempotencyKeyModel, key)
        if obj is None:
            return None
        return IdempotencyRecord.model_validate(obj)

    def put(
        self,
        key: str,
        request_hash: str,
        response: dict[str, Any] | None,
        ttl_seconds: int,
    ) -> IdempotencyRecord:
        now = datetime.now(UTC)
        obj = IdempotencyKeyModel(
            key=key,
            request_hash=request_hash,
            response_snapshot=response,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return IdempotencyRecord.model_validate(obj)

    def purge_expired(self, now: datetime | None = None) -> int:
        cutoff = now or datetime.now(UTC)
        result = self._session.execute(
            delete(IdempotencyKeyModel).where(IdempotencyKeyModel.expires_at < cutoff)
        )
        self._session.flush()
        return int(result.rowcount or 0)
