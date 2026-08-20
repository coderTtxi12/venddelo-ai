# Restaurant /delivery SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/delivery` creates a courier request without the false error banner, and stays live via visibility-gated SSE instead of a Cloud Run WebSocket.

**Architecture:** Convert `RestaurantDispatchRealtimeHub` from WebSocket rooms to `asyncio.Queue` subscribers. Replace `WS /ws/restaurants/{id}/dispatch` with `GET /restaurants/{id}/dispatch/events`. The owner dashboard opens that stream only while the tab is visible, refetches the REST list on `dispatch.updated`, and aborts at 240 s. `notes` becomes controlled state so submit no longer calls `event.currentTarget.reset()`.

**Tech Stack:** FastAPI `StreamingResponse`, asyncio queues, Next.js 16, `fetch` + SSE parser, pytest, `node --import tsx --test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-restaurant-delivery-sse-design.es.md`
- Transport is SSE (`text/event-stream`). No WebSocket, no Supabase Realtime, no Redis for this page.
- Open SSE only when `document.visibilityState === 'visible'` and `restaurantId` + token exist.
- Auth: `Authorization: Bearer`. No token in the query string.
- Fan-out stays in-process. `publish_sync(restaurant_id, payload)` signature does not change.
- Event payload is `{"type": "dispatch.updated"}`. Client refetches GET list. No DTO on the stream.
- Poll 20 s only if visible and SSE is not `live`. Zero poll when the tab is hidden.
- Client aborts and reconnects at **240_000 ms**. Server heartbeat every **15 s** as SSE comment `: ping`.
- Do not change monitor, rider, or kitchen WebSockets.
- Same live indicator copy (`En vivo` / `Conectando` / `Reconectando` / `Sin enlace`).
- Do not hold a SQLAlchemy session for the duration of the stream. Short UoW for authz, then close, then yield.
- TDD: failing test first; watch it fail; then implement.
- Pytest: `cd backend && .venv/bin/python -m pytest <path> -v --tb=short`
- Frontend tests: `cd frontend && node --import tsx --test <path>`
- Do not commit unless the user asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/infra/realtime/restaurant_dispatch_hub.py` | Queue subscribe/unsubscribe/`publish_sync` |
| `backend/tests/modules/test_restaurant_dispatch_realtime_hub.py` | Hub queue tests |
| `backend/app/modules/delivery_dispatch/ws.py` | SSE GET; delete restaurant dispatch WS |
| `backend/tests/api/test_restaurant_dispatch_requests.py` | 401/403/SSE body; delete WS connect test |
| `backend/tests/modules/test_delivery_dispatch_ws.py` | Assert restaurant dispatch WS route gone |
| `frontend/src/lib/dispatch/restaurantDispatchSse.ts` | `shouldOpen` + `parseRestaurantDispatchSseBlock` |
| `frontend/src/lib/dispatch/restaurantDispatchSse.test.ts` | Pure helper tests |
| `frontend/src/lib/dispatch/streamRestaurantDispatchEvents.ts` | `fetch` GET SSE loop |
| `frontend/src/lib/dispatch/streamRestaurantDispatchEvents.test.ts` | Abort + parse integration with fake fetch |
| `frontend/src/lib/dispatch/useRestaurantDispatchEvents.ts` | Visibility, reconnect 240 s, debounce |
| `frontend/src/lib/dispatch/useRestaurantDispatchSocket.ts` | Delete |
| `frontend/src/components/pages/DeliveryPage.tsx` | Wire hook, poll rules, controlled `notes`, no `reset()` |

---

### Task 1: Hub queues instead of WebSockets

**Files:**
- Modify: `backend/app/infra/realtime/restaurant_dispatch_hub.py`
- Modify: `backend/tests/modules/test_restaurant_dispatch_realtime_hub.py`

**Interfaces:**
- Consumes: existing `publish_sync(restaurant_id: uuid.UUID, payload: dict[str, Any]) -> None` callers (`notify_request_realtime`).
- Produces:
  - `subscribe(restaurant_id: uuid.UUID) -> asyncio.Queue[dict[str, Any]]` (`maxsize=8`)
  - `unsubscribe(restaurant_id: uuid.UUID, queue: asyncio.Queue[dict[str, Any]]) -> None`
  - `bind_loop(loop)` / `shutdown()` still exist
  - No `connect` / `disconnect` / WebSocket

- [ ] **Step 1: Write the failing hub tests**

Replace `backend/tests/modules/test_restaurant_dispatch_realtime_hub.py` with:

```python
"""Restaurant dispatch realtime hub broadcasts to SSE queues."""

from __future__ import annotations

import asyncio
import uuid

from app.infra.realtime.restaurant_dispatch_hub import RestaurantDispatchRealtimeHub


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_restaurant_dispatch_realtime_hub.py -v --tb=short`

Expected: FAIL — `subscribe` is not defined (or `FakeSocket` path no longer matches).

- [ ] **Step 3: Implement the hub**

Replace `backend/app/infra/realtime/restaurant_dispatch_hub.py` with:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_restaurant_dispatch_realtime_hub.py -v --tb=short`

Expected: PASS (3 tests)

- [ ] **Step 5: Skip commit** unless the user asked.

---

### Task 2: SSE endpoint and remove restaurant dispatch WebSocket

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/ws.py`
- Modify: `backend/tests/api/test_restaurant_dispatch_requests.py`
- Modify: `backend/tests/modules/test_delivery_dispatch_ws.py`

**Interfaces:**
- Consumes: `get_restaurant_dispatch_realtime_hub().subscribe` / `unsubscribe` / `publish_sync`
- Produces: `GET /api/v1/restaurants/{restaurant_id}/dispatch/events` (`text/event-stream`)
- Deletes: `WS /api/v1/ws/restaurants/{restaurant_id}/dispatch`

- [ ] **Step 1: Write failing API / route tests**

In `backend/tests/modules/test_delivery_dispatch_ws.py` add:

```python
def test_restaurant_dispatch_ws_route_removed() -> None:
    from app.main import app

    ws_paths = [
        route.path
        for route in _iter_routes(app.routes)
        if isinstance(route, WebSocketRoute) and route.path.endswith("/dispatch")
        and "/restaurants/" in route.path
    ]
    assert ws_paths == []
```

In `backend/tests/api/test_restaurant_dispatch_requests.py`:

Delete `test_restaurant_dispatch_ws_accepts_owner`.

Add (reuse `_create_restaurant`, `AUTH`, `OWNER` imports already in that file; import `OTHER` from `tests.api.test_api_v1`):

```python
def test_dispatch_events_requires_bearer(client, engine):
    restaurant_id = _create_restaurant(client, subdomain="dispatch-sse-401")
    response = client.get(f"/api/v1/restaurants/{restaurant_id}/dispatch/events")
    assert response.status_code == 401


def test_dispatch_events_forbidden_for_other_user(client, engine):
    from app.api.deps import get_auth
    from app.main import app
    from tests.api.test_api_v1 import OTHER, FakeAuth

    restaurant_id = _create_restaurant(client, subdomain="dispatch-sse-403")
    app.dependency_overrides[get_auth] = lambda: FakeAuth(OTHER)
    try:
        response = client.get(
            f"/api/v1/restaurants/{restaurant_id}/dispatch/events",
            headers=AUTH,
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides[get_auth] = lambda: __import__(
            "tests.api.test_api_v1", fromlist=["FakeAuth"]
        ).FakeAuth(OWNER)


def test_dispatch_events_streams_published_event(client, engine):
    import json
    import threading
    import time
    import uuid as uuid_mod

    from app.infra.realtime.restaurant_dispatch_hub import get_restaurant_dispatch_realtime_hub

    restaurant_id = _create_restaurant(client, subdomain="dispatch-sse-ok")
    rid = uuid_mod.UUID(restaurant_id)
    hub = get_restaurant_dispatch_realtime_hub()

    def publish_soon() -> None:
        time.sleep(0.15)
        hub.publish_sync(rid, {"type": "dispatch.updated"})

    worker = threading.Thread(target=publish_soon)
    worker.start()
    with client.stream(
        "GET",
        f"/api/v1/restaurants/{restaurant_id}/dispatch/events",
        headers=AUTH,
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = b""
        for chunk in response.iter_bytes():
            body += chunk
            if b"event: dispatch.updated" in body:
                break
    worker.join(timeout=2)
    text = body.decode("utf-8")
    assert "event: dispatch.updated" in text
    assert json.dumps({"type": "dispatch.updated"}) in text
```

Keep `test_create_dispatch_publishes_restaurant_realtime_event` as-is.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```
cd backend && .venv/bin/python -m pytest tests/modules/test_delivery_dispatch_ws.py::test_restaurant_dispatch_ws_route_removed tests/api/test_restaurant_dispatch_requests.py::test_dispatch_events_requires_bearer tests/api/test_restaurant_dispatch_requests.py::test_dispatch_events_forbidden_for_other_user tests/api/test_restaurant_dispatch_requests.py::test_dispatch_events_streams_published_event -v --tb=short
```

Expected: FAIL — 404 on GET events; WS route still present.

- [ ] **Step 3: Implement the SSE route and delete the WS route**

In `backend/app/modules/delivery_dispatch/ws.py`:

1. Add imports: `asyncio`, `json`, `StreamingResponse`, `get_current_user`, `ForbiddenError`, `NotFoundError`, `AuthenticatedUser`.
2. Delete `restaurant_dispatch_ws`.
3. Add:

```python
@router.get("/restaurants/{restaurant_id}/dispatch/events")
async def restaurant_dispatch_events(
    restaurant_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
) -> StreamingResponse:
    with SqlAlchemyUnitOfWork() as uow:
        restaurant = uow.restaurants.get(restaurant_id)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")
        allowed = restaurant.owner_id == user.id
        if not allowed:
            found = uow.restaurants.get_for_user(user.id, restaurant_id=restaurant_id)
            allowed = found is not None and found[1] in ("owner", "admin")
        if not allowed:
            raise ForbiddenError("You do not have access to this restaurant")

    hub = get_restaurant_dispatch_realtime_hub()
    queue = hub.subscribe(restaurant_id)

    async def event_generator():
        try:
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield (
                    "event: dispatch.updated\n"
                    f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                )
        finally:
            hub.unsubscribe(restaurant_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

Do **not** inject `get_uow` or `require_owned_restaurant` on this endpoint.

Leave `dispatch_monitor_ws` and `rider_me_ws` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```
cd backend && .venv/bin/python -m pytest tests/modules/test_delivery_dispatch_ws.py tests/modules/test_restaurant_dispatch_realtime_hub.py tests/api/test_restaurant_dispatch_requests.py -v --tb=short
```

Expected: PASS, including `test_create_dispatch_publishes_restaurant_realtime_event`.

- [ ] **Step 5: Skip commit** unless the user asked.

---

### Task 3: Frontend SSE helpers

**Files:**
- Create: `frontend/src/lib/dispatch/restaurantDispatchSse.ts`
- Create: `frontend/src/lib/dispatch/restaurantDispatchSse.test.ts`

**Interfaces:**
- Produces:
  - `shouldOpenRestaurantDispatchSse({ restaurantId, accessToken, visibilityState }): boolean`
  - `parseRestaurantDispatchSseBlock(block: string): { type: 'dispatch.updated' } | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/dispatch/restaurantDispatchSse.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseRestaurantDispatchSseBlock,
  shouldOpenRestaurantDispatchSse,
} from './restaurantDispatchSse.ts';

test('opens only when visible with restaurant and token', () => {
  assert.equal(
    shouldOpenRestaurantDispatchSse({
      restaurantId: 'r1',
      accessToken: 'tok',
      visibilityState: 'visible',
    }),
    true,
  );
  assert.equal(
    shouldOpenRestaurantDispatchSse({
      restaurantId: 'r1',
      accessToken: 'tok',
      visibilityState: 'hidden',
    }),
    false,
  );
  assert.equal(
    shouldOpenRestaurantDispatchSse({
      restaurantId: null,
      accessToken: 'tok',
      visibilityState: 'visible',
    }),
    false,
  );
  assert.equal(
    shouldOpenRestaurantDispatchSse({
      restaurantId: 'r1',
      accessToken: null,
      visibilityState: 'visible',
    }),
    false,
  );
});

test('parses dispatch.updated and ignores ping', () => {
  assert.deepEqual(
    parseRestaurantDispatchSseBlock(
      'event: dispatch.updated\ndata: {"type":"dispatch.updated"}',
    ),
    { type: 'dispatch.updated' },
  );
  assert.equal(parseRestaurantDispatchSseBlock(': ping'), null);
  assert.equal(parseRestaurantDispatchSseBlock('event: heartbeat\ndata: {}'), null);
  assert.equal(parseRestaurantDispatchSseBlock('not json'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/restaurantDispatchSse.test.ts`

Expected: FAIL — `Cannot find module './restaurantDispatchSse.ts'`

- [ ] **Step 3: Implement helpers**

Create `frontend/src/lib/dispatch/restaurantDispatchSse.ts`:

```ts
export type RestaurantDispatchSseEvent = { type: 'dispatch.updated' };

export function shouldOpenRestaurantDispatchSse(input: {
  restaurantId: string | null;
  accessToken: string | null;
  visibilityState: DocumentVisibilityState;
}): boolean {
  return Boolean(
    input.restaurantId && input.accessToken && input.visibilityState === 'visible',
  );
}

export function parseRestaurantDispatchSseBlock(
  block: string,
): RestaurantDispatchSseEvent | null {
  const trimmed = block.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;

  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of trimmed.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  if (eventName !== 'dispatch.updated' && eventName !== 'message') return null;

  try {
    const payload = JSON.parse(dataLines.join('\n')) as { type?: string };
    if (payload.type !== 'dispatch.updated') return null;
    return { type: 'dispatch.updated' };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/restaurantDispatchSse.test.ts`

Expected: PASS

- [ ] **Step 5: Skip commit** unless the user asked.

---

### Task 4: Fetch SSE client

**Files:**
- Create: `frontend/src/lib/dispatch/streamRestaurantDispatchEvents.ts`
- Create: `frontend/src/lib/dispatch/streamRestaurantDispatchEvents.test.ts`

**Interfaces:**
- Consumes: `parseRestaurantDispatchSseBlock`, `isFetchAbortError` from `@/lib/api/assistantStream`
- Produces: `streamRestaurantDispatchEvents({ apiUrl, restaurantId, accessToken, signal, onOpen?, onEvent }): Promise<void>`

- [ ] **Step 1: Write the failing stream test**

Create `frontend/src/lib/dispatch/streamRestaurantDispatchEvents.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { streamRestaurantDispatchEvents } from './streamRestaurantDispatchEvents.ts';

test('emits dispatch.updated and ignores ping comments', async () => {
  const chunks = [
    ': ping\n\n',
    'event: dispatch.updated\ndata: {"type":"dispatch.updated"}\n\n',
  ];
  const encoder = new TextEncoder();
  let index = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index += 1;
          return;
        }
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }) as typeof fetch;

  const events: Array<{ type: string }> = [];
  try {
    await streamRestaurantDispatchEvents({
      apiUrl: 'http://localhost:8080/api/v1',
      restaurantId: 'r1',
      accessToken: 'tok',
      onEvent: (event) => {
        events.push(event);
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, [{ type: 'dispatch.updated' }]);
});

test('abort is not thrown', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;

  const controller = new AbortController();
  const done = streamRestaurantDispatchEvents({
    apiUrl: 'http://localhost:8080/api/v1',
    restaurantId: 'r1',
    accessToken: 'tok',
    signal: controller.signal,
    onEvent: () => undefined,
  });
  controller.abort();
  await assert.doesNotReject(done);
  globalThis.fetch = originalFetch;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/streamRestaurantDispatchEvents.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the stream client**

Create `frontend/src/lib/dispatch/streamRestaurantDispatchEvents.ts`:

```ts
import { ApiError } from '@/lib/api/types';
import { isFetchAbortError } from '@/lib/api/assistantStream';
import {
  parseRestaurantDispatchSseBlock,
  type RestaurantDispatchSseEvent,
} from './restaurantDispatchSse';

type StreamOptions = {
  apiUrl: string;
  restaurantId: string;
  accessToken: string;
  signal?: AbortSignal;
  onOpen?: () => void;
  onEvent: (event: RestaurantDispatchSseEvent) => void;
};

export async function streamRestaurantDispatchEvents(options: StreamOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${options.apiUrl}/restaurants/${options.restaurantId}/dispatch/events`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${options.accessToken}`,
        },
        signal: options.signal,
      },
    );
  } catch (error) {
    if (options.signal?.aborted || isFetchAbortError(error)) return;
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    let message = response.statusText;
    try {
      const parsed = text ? JSON.parse(text) : null;
      message = parsed?.error?.message ?? message;
    } catch {
      if (text) message = text;
    }
    throw new ApiError('dispatch_sse_error', message, response.status);
  }

  if (!response.body) {
    throw new ApiError('dispatch_sse_error', 'El servidor no devolvió un stream.', 500);
  }

  options.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (error) {
        if (options.signal?.aborted || isFetchAbortError(error)) return;
        throw error;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const parsed = parseRestaurantDispatchSseBlock(block);
        if (parsed) options.onEvent(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

Path alias `@/` may fail under `node --import tsx --test`. If it does, import relative:

`import { ApiError } from '../api/types.ts';`
`import { isFetchAbortError } from '../api/assistantStream.ts';`

Match `publicTrackingRealtime.test.ts`, which imports `@/lib/api/dispatch` successfully.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/streamRestaurantDispatchEvents.test.ts src/lib/dispatch/restaurantDispatchSse.test.ts`

Expected: PASS

- [ ] **Step 5: Skip commit** unless the user asked.

---

### Task 5: Hook + DeliveryPage (live + form)

**Files:**
- Create: `frontend/src/lib/dispatch/useRestaurantDispatchEvents.ts`
- Delete: `frontend/src/lib/dispatch/useRestaurantDispatchSocket.ts`
- Modify: `frontend/src/components/pages/DeliveryPage.tsx`

**Interfaces:**
- Consumes: `shouldOpenRestaurantDispatchSse`, `streamRestaurantDispatchEvents`
- Produces: `useRestaurantDispatchEvents(restaurantId, accessToken, { onEvent, onStatusChange, onReconnect, eventDebounceMs? })` with statuses `connecting | live | reconnecting | offline`, returns `{ visibilityState }`

No component test for `DeliveryPage`. Form fix is: controlled `notes`, no `event.currentTarget.reset()`.

- [ ] **Step 1: Confirm helper tests still pass (no DeliveryPage unit test)**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/restaurantDispatchSse.test.ts`

Expected: PASS (already green). This task is wiring; the form bug is the missing `reset()` call.

- [ ] **Step 2: Implement the hook**

Create `frontend/src/lib/dispatch/useRestaurantDispatchEvents.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { isFetchAbortError } from '@/lib/api/assistantStream';
import {
  shouldOpenRestaurantDispatchSse,
  type RestaurantDispatchSseEvent,
} from './restaurantDispatchSse';
import { streamRestaurantDispatchEvents } from './streamRestaurantDispatchEvents';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';
const STREAM_MAX_MS = 240_000;

export type RestaurantDispatchEvent = RestaurantDispatchSseEvent;
export type RestaurantDispatchStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type Options = {
  onEvent: (event: RestaurantDispatchEvent) => void;
  onStatusChange?: (status: RestaurantDispatchStreamStatus) => void;
  onReconnect?: () => void;
  eventDebounceMs?: number;
};

export function useRestaurantDispatchEvents(
  restaurantId: string | null,
  accessToken: string | null,
  options: Options,
) {
  const onEventRef = useRef(options.onEvent);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onReconnectRef = useRef(options.onReconnect);
  const debounceMs = options.eventDebounceMs ?? 300;
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(() =>
    typeof document === 'undefined' ? 'visible' : document.visibilityState,
  );

  useEffect(() => {
    onEventRef.current = options.onEvent;
    onStatusChangeRef.current = options.onStatusChange;
    onReconnectRef.current = options.onReconnect;
  });

  useEffect(() => {
    const onVisibility = () => setVisibilityState(document.visibilityState);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const open = shouldOpenRestaurantDispatchSse({
    restaurantId,
    accessToken,
    visibilityState,
  });

  useEffect(() => {
    if (!open || !restaurantId || !accessToken) {
      onStatusChangeRef.current?.('offline');
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    let eventTimer: number | null = null;
    let maxTimer: number | null = null;
    let abort: AbortController | null = null;
    let retryMs = 1_000;
    let hasConnectedOnce = false;
    let inFlight = false;
    let pendingEvent: RestaurantDispatchEvent | null = null;

    const flushEvent = () => {
      if (cancelled || !pendingEvent || inFlight) return;
      const event = pendingEvent;
      pendingEvent = null;
      inFlight = true;
      Promise.resolve(onEventRef.current(event)).finally(() => {
        inFlight = false;
        if (pendingEvent) {
          eventTimer = window.setTimeout(flushEvent, debounceMs);
        }
      });
    };

    const queueEvent = (event: RestaurantDispatchEvent) => {
      pendingEvent = event;
      if (eventTimer != null) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(flushEvent, debounceMs);
    };

    const connect = () => {
      if (cancelled) return;
      abort?.abort();
      abort = new AbortController();
      if (hasConnectedOnce) onStatusChangeRef.current?.('reconnecting');
      else onStatusChangeRef.current?.('connecting');

      if (maxTimer != null) window.clearTimeout(maxTimer);
      maxTimer = window.setTimeout(() => {
        abort?.abort();
      }, STREAM_MAX_MS);

      void streamRestaurantDispatchEvents({
        apiUrl: API_URL,
        restaurantId,
        accessToken,
        signal: abort.signal,
        onEvent: queueEvent,
      })
        .then(() => undefined)
        .catch((error) => {
          if (cancelled || isFetchAbortError(error) || abort?.signal.aborted) return;
          console.warn('restaurant dispatch sse error', error);
        })
        .finally(() => {
          if (cancelled) return;
          onStatusChangeRef.current?.('reconnecting');
          retryTimer = window.setTimeout(() => {
            retryMs = Math.min(retryMs * 2, 30_000);
            connect();
          }, retryMs);
        });

      // Mark live once the fetch is in flight; streamRestaurantDispatchEvents
      // throws before reading if status is not ok. A 200 starts the reader.
      window.setTimeout(() => {
        if (cancelled || abort?.signal.aborted) return;
        if (hasConnectedOnce) onReconnectRef.current?.();
        hasConnectedOnce = true;
        retryMs = 1_000;
        onStatusChangeRef.current?.('live');
      }, 0);
    };

    connect();

    return () => {
      cancelled = true;
      abort?.abort();
      if (retryTimer != null) window.clearTimeout(retryTimer);
      if (eventTimer != null) window.clearTimeout(eventTimer);
      if (maxTimer != null) window.clearTimeout(maxTimer);
      onStatusChangeRef.current?.('offline');
    };
  }, [open, restaurantId, accessToken, debounceMs]);

  return { visibilityState };
}
```

The `setTimeout(..., 0)` live mark is wrong if fetch 401s. Fix in the stream client: add `onOpen?: () => void` called after `response.ok` and `response.body` exist, before the read loop. Then the hook sets `live` there.

Update Task 4's `streamRestaurantDispatchEvents` options:

```ts
onOpen?: () => void;
```

Call `options.onOpen?.()` after confirming `response.ok` and `response.body`.

Hook `connect`:

```ts
void streamRestaurantDispatchEvents({
  ...
  onOpen: () => {
    if (cancelled) return;
    retryMs = 1_000;
    if (hasConnectedOnce) onReconnectRef.current?.();
    hasConnectedOnce = true;
    onStatusChangeRef.current?.('live');
  },
  onEvent: queueEvent,
})
```

Do **not** use `setTimeout(0)` to mark live.

- [ ] **Step 3: Wire DeliveryPage and fix submit**

In `frontend/src/components/pages/DeliveryPage.tsx`:

1. Replace `useRestaurantDispatchSocket` import with `useRestaurantDispatchEvents` and type `RestaurantDispatchStreamStatus`.
2. Rename `LIVE_COPY` generic param to `RestaurantDispatchStreamStatus`.
3. Add `const [notes, setNotes] = useState('');`
4. Replace the socket hook call with:

```tsx
  const { visibilityState } = useRestaurantDispatchEvents(selectedRestaurantId, accessToken, {
    onEvent: () => {
      void refreshRequests();
    },
    onStatusChange: setSocketStatus,
    onReconnect: () => {
      void refreshRequests();
    },
  });
```

5. Replace the poll effect:

```tsx
  useEffect(() => {
    if (!accessToken || !selectedRestaurantId) return;
    if (visibilityState !== 'visible') return;
    if (socketStatus === 'live') return;
    const timer = window.setInterval(() => {
      void refreshRequests();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [accessToken, refreshRequests, selectedRestaurantId, socketStatus, visibilityState]);
```

6. In `submit`:
   - Remove `const form = new FormData(event.currentTarget);`
   - Pass `notes: notes.trim() || null`
   - After success: `setNotes('');`
   - **Delete** `event.currentTarget.reset();`

7. Notes textarea:

```tsx
              <textarea
                id="driver-notes"
                className={styles.textarea}
                maxLength={500}
                rows={3}
                disabled={!courierAvailable}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
```

Remove `name="notes"`.

8. Delete `frontend/src/lib/dispatch/useRestaurantDispatchSocket.ts`.

- [ ] **Step 4: Run frontend tests + grep that WS client is gone**

Run:

```
cd frontend && node --import tsx --test src/lib/dispatch/restaurantDispatchSse.test.ts src/lib/dispatch/streamRestaurantDispatchEvents.test.ts
```

Expected: PASS

Grep the frontend for `ws/restaurants` and `useRestaurantDispatchSocket`. Expected: no matches.

- [ ] **Step 5: Skip commit** unless the user asked.

---

## Spec coverage

| Spec section | Task |
|---|---|
| §4 form `reset()` bug | 5 |
| §7.1 hub queues | 1 |
| §7.2 SSE GET + no long UoW + delete WS | 2 |
| §7.3 publish_sync unchanged | 1–2 |
| §8.1 helpers | 3 |
| §8.2 fetch stream | 4 |
| §8.3 hook visibility / 240 s / debounce | 5 |
| §8.4 poll rules | 5 |
| §8.5 controlled notes | 5 |
| §10 tests | 1–4 |
| Monitor/rider unchanged | 2 (do not touch those routes) |

## Execution note

After this plan is saved, implement task-by-task with TDD. Do not commit unless the user asks.
