from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class RestaurantDispatchRealtimeHub:
    """In-process SSE fan-out for restaurant-owner dispatch requests."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def shutdown(self) -> None:
        self._loop = None
        self._rooms.clear()

    def _room_key(self, restaurant_id: uuid.UUID) -> str:
        return f"restaurant:{restaurant_id}:dispatch"

    def subscribe(self, restaurant_id: uuid.UUID) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=8)
        self._rooms[self._room_key(restaurant_id)].add(queue)
        logger.info("restaurant dispatch sse subscribed restaurant_id=%s", restaurant_id)
        return queue

    def unsubscribe(
        self,
        restaurant_id: uuid.UUID,
        queue: asyncio.Queue[dict[str, Any]],
    ) -> None:
        room = self._room_key(restaurant_id)
        self._rooms[room].discard(queue)
        if not self._rooms[room]:
            del self._rooms[room]
        logger.info("restaurant dispatch sse unsubscribed restaurant_id=%s", restaurant_id)

    def publish_sync(self, restaurant_id: uuid.UUID, payload: dict[str, Any]) -> None:
        if self._loop is None:
            logger.debug(
                "restaurant dispatch sse hub not started; dropping event restaurant_id=%s",
                restaurant_id,
            )
            return
        room = self._room_key(restaurant_id)
        self._loop.call_soon_threadsafe(self._fanout, room, payload)

    def _fanout(self, room: str, payload: dict[str, Any]) -> None:
        for queue in list(self._rooms.get(room, ())):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass


_hub = RestaurantDispatchRealtimeHub()


def get_restaurant_dispatch_realtime_hub() -> RestaurantDispatchRealtimeHub:
    return _hub
