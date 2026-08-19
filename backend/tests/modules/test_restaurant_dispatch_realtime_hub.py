"""Restaurant dispatch realtime hub broadcasts."""

from __future__ import annotations

import asyncio
import uuid

from starlette.websockets import WebSocketState

from app.infra.realtime.restaurant_dispatch_hub import RestaurantDispatchRealtimeHub


def test_restaurant_dispatch_realtime_hub_broadcasts_to_connected_socket():
    async def run() -> None:
        hub = RestaurantDispatchRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())

        received: list[dict] = []

        class FakeSocket:
            client_state = WebSocketState.CONNECTED

            async def send_json(self, payload: dict) -> None:
                received.append(payload)

        restaurant_id = uuid.uuid4()
        socket = FakeSocket()
        hub._rooms[hub._room_key(restaurant_id)].add(socket)  # noqa: SLF001

        hub.publish_sync(restaurant_id, {"type": "dispatch.updated"})
        await asyncio.sleep(0.05)

        assert received
        assert received[0]["type"] == "dispatch.updated"

    asyncio.run(run())
