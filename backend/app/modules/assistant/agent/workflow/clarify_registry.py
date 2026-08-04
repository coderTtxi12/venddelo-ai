from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass


@dataclass
class _PendingClarify:
    clarify_id: uuid.UUID
    future: asyncio.Future[object]


class ClarifyWaitRegistry:
    """Track clarify futures created and resolved on the assistant event loop.

    ``resolve`` and ``fail`` must run on the same event loop that called
    ``create``. The clarify answer endpoint is async so FastAPI invokes it on
    that loop before it settles the pending future.
    """

    def __init__(self) -> None:
        self._pending: dict[uuid.UUID, _PendingClarify] = {}

    def create(self, conversation_id: uuid.UUID) -> tuple[uuid.UUID, asyncio.Future[object]]:
        clarify_id = uuid.uuid4()
        future: asyncio.Future[object] = asyncio.get_running_loop().create_future()

        previous = self._pending.get(conversation_id)
        if previous is not None and not previous.future.done():
            previous.future.set_result({"__clarify_error__": "superseded"})

        self._pending[conversation_id] = _PendingClarify(clarify_id=clarify_id, future=future)
        return clarify_id, future

    def resolve(
        self,
        conversation_id: uuid.UUID,
        clarify_id: uuid.UUID,
        user_response: object,
    ) -> None:
        pending = self._get_pending_entry(conversation_id, clarify_id)
        if not pending.future.done():
            pending.future.set_result(user_response)
        del self._pending[conversation_id]

    def fail(self, conversation_id: uuid.UUID, clarify_id: uuid.UUID, error: str) -> None:
        pending = self._get_pending_entry(conversation_id, clarify_id)
        if not pending.future.done():
            pending.future.set_result({"__clarify_error__": error})
        del self._pending[conversation_id]

    def get_pending(self, conversation_id: uuid.UUID) -> uuid.UUID | None:
        pending = self._pending.get(conversation_id)
        return pending.clarify_id if pending is not None else None

    def _get_pending_entry(
        self,
        conversation_id: uuid.UUID,
        clarify_id: uuid.UUID,
    ) -> _PendingClarify:
        pending = self._pending.get(conversation_id)
        if pending is None or pending.clarify_id != clarify_id:
            raise KeyError(f"No pending clarify for conversation {conversation_id} id {clarify_id}")
        return pending


_registry: ClarifyWaitRegistry | None = None


def get_clarify_registry() -> ClarifyWaitRegistry:
    global _registry
    if _registry is None:
        _registry = ClarifyWaitRegistry()
    return _registry
