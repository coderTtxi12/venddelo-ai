"""Public tracking realtime hub broadcasts."""

from __future__ import annotations

import asyncio

from starlette.websockets import WebSocketState

from app.infra.realtime.tracking_hub import TrackingRealtimeHub


def test_tracking_realtime_hub_broadcasts_to_connected_socket():
    async def run() -> None:
        hub = TrackingRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())

        received: list[dict] = []

        class FakeSocket:
            client_state = WebSocketState.CONNECTED

            async def send_json(self, payload: dict) -> None:
                received.append(payload)

        token = "a" * 48
        socket = FakeSocket()
        hub._rooms[hub._room_key(token)].add(socket)  # noqa: SLF001

        hub.publish_sync(token, {"type": "tracking.updated", "tracking": {"status": "assigned"}})
        await asyncio.sleep(0.05)

        assert received
        assert received[0]["type"] == "tracking.updated"
        assert received[0]["tracking"]["status"] == "assigned"

    asyncio.run(run())
