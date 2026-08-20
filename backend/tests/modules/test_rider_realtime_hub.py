"""Rider realtime hub broadcasts."""

from __future__ import annotations

import asyncio
import uuid

from starlette.websockets import WebSocketState

from app.infra.realtime.rider_hub import RiderRealtimeHub


def test_rider_realtime_hub_broadcasts_to_connected_socket():
    async def run() -> None:
        hub = RiderRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())

        received: list[dict] = []

        class FakeSocket:
            client_state = WebSocketState.CONNECTED

            async def send_json(self, payload: dict) -> None:
                received.append(payload)

        driver_id = uuid.uuid4()
        socket = FakeSocket()
        hub._rooms[hub._room_key(driver_id)].add(socket)  # noqa: SLF001

        hub.publish_sync(driver_id, {"type": "rider.updated"})
        await asyncio.sleep(0.05)

        assert received
        assert received[0]["type"] == "rider.updated"

    asyncio.run(run())
