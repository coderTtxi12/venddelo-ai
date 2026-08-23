"""Restaurant dispatch realtime hub broadcasts to SSE queues."""

from __future__ import annotations

import asyncio
import uuid

from app.infra.realtime.restaurant_dispatch_hub import (
    RestaurantDispatchRealtimeHub,
    notify_restaurants_delivery_service_updated,
)


def test_subscribe_receives_publish_sync() -> None:
    async def run() -> None:
        hub = RestaurantDispatchRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())
        restaurant_id = uuid.uuid4()
        queue = hub.subscribe(restaurant_id)

        hub.publish_sync(restaurant_id, {"type": "dispatch.updated"})
        payload = await asyncio.wait_for(queue.get(), timeout=1)

        assert payload == {"type": "dispatch.updated"}
        hub.unsubscribe(restaurant_id, queue)

    asyncio.run(run())


def test_unsubscribe_does_not_receive_later_publish() -> None:
    async def run() -> None:
        hub = RestaurantDispatchRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())
        restaurant_id = uuid.uuid4()
        queue = hub.subscribe(restaurant_id)
        hub.unsubscribe(restaurant_id, queue)

        hub.publish_sync(restaurant_id, {"type": "dispatch.updated"})
        await asyncio.sleep(0.05)

        assert queue.empty()

    asyncio.run(run())


def test_full_queue_drops_oldest_and_keeps_latest() -> None:
    async def run() -> None:
        hub = RestaurantDispatchRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())
        restaurant_id = uuid.uuid4()
        queue = hub.subscribe(restaurant_id)

        for index in range(9):
            hub.publish_sync(restaurant_id, {"type": "dispatch.updated", "n": index})
        await asyncio.sleep(0.05)

        items: list[dict] = []
        while not queue.empty():
            items.append(queue.get_nowait())

        assert len(items) == 8
        assert items[-1]["n"] == 8
        hub.unsubscribe(restaurant_id, queue)

    asyncio.run(run())


def test_notify_restaurants_delivery_service_updated() -> None:
    async def run() -> None:
        from app.infra.realtime import restaurant_dispatch_hub as hub_module

        hub = RestaurantDispatchRealtimeHub()
        hub.bind_loop(asyncio.get_running_loop())
        previous = hub_module._hub
        hub_module._hub = hub
        restaurant_id = uuid.uuid4()
        queue = hub.subscribe(restaurant_id)
        try:
            notify_restaurants_delivery_service_updated([restaurant_id])
            payload = await asyncio.wait_for(queue.get(), timeout=1)
            assert payload == {"type": "delivery.service.updated"}
        finally:
            hub.unsubscribe(restaurant_id, queue)
            hub_module._hub = previous

    asyncio.run(run())
