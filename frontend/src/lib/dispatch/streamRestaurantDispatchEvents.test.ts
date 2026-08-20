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
        init?.signal?.addEventListener('abort', () => {
          controller.error(new DOMException('aborted', 'AbortError'));
        });
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
  try {
    await assert.doesNotReject(done);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
