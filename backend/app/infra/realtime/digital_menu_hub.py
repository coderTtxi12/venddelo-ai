from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class DigitalMenuRealtimeHub:
    """In-process WebSocket fan-out for owner digital-menu preview events."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue[tuple[str, dict[str, Any]]] | None = None
        self._worker_task: asyncio.Task[None] | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        if self._queue is None:
            self._queue = asyncio.Queue()
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = loop.create_task(self._worker())

    async def shutdown(self) -> None:
        if self._worker_task is not None:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None
        self._queue = None
        self._loop = None
        self._rooms.clear()

    async def _worker(self) -> None:
        assert self._queue is not None
        while True:
            room, payload = await self._queue.get()
            await self._broadcast(room, payload)

    def _room_key(self, restaurant_id: uuid.UUID) -> str:
        return f"restaurant:{restaurant_id}:digital-menu"

    async def connect(self, restaurant_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[self._room_key(restaurant_id)].add(websocket)
        logger.info("digital-menu ws connected restaurant_id=%s", restaurant_id)

    async def disconnect(self, restaurant_id: uuid.UUID, websocket: WebSocket) -> None:
        room = self._room_key(restaurant_id)
        self._rooms[room].discard(websocket)
        if not self._rooms[room]:
            del self._rooms[room]
        logger.info("digital-menu ws disconnected restaurant_id=%s", restaurant_id)

    def publish_sync(self, restaurant_id: uuid.UUID, payload: dict[str, Any]) -> None:
        if self._loop is None or self._queue is None:
            logger.debug(
                "digital-menu ws hub not started; dropping event restaurant_id=%s",
                restaurant_id,
            )
            return
        room = self._room_key(restaurant_id)
        self._loop.call_soon_threadsafe(self._queue.put_nowait, (room, payload))

    async def _broadcast(self, room: str, payload: dict[str, Any]) -> None:
        sockets = list(self._rooms.get(room, set()))
        if not sockets:
            return
        stale: list[WebSocket] = []
        for socket in sockets:
            if socket.client_state != WebSocketState.CONNECTED:
                stale.append(socket)
                continue
            try:
                await socket.send_json(payload)
            except Exception:
                logger.warning("digital-menu ws send failed", exc_info=True)
                stale.append(socket)
        for socket in stale:
            self._rooms[room].discard(socket)


_hub = DigitalMenuRealtimeHub()


def get_digital_menu_realtime_hub() -> DigitalMenuRealtimeHub:
    return _hub
