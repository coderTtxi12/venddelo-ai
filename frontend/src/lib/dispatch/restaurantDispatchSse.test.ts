import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeDispatchRequestLists,
  parseRestaurantDispatchSseBlock,
  patchRequestsFromDispatchEvent,
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

test('parses dispatch.updated with request id and status', () => {
  assert.deepEqual(
    parseRestaurantDispatchSseBlock(
      'event: dispatch.updated\ndata: {"type":"dispatch.updated","request_id":"req-1","status":"assigned"}',
    ),
    { type: 'dispatch.updated', requestId: 'req-1', status: 'assigned' },
  );
});

test('list refresh cannot regress a newer SSE status', () => {
  const merged = mergeDispatchRequestLists(
    [
      { id: 'req-1', status: 'assigned', rider: { first_name: 'Ana' } },
      { id: 'req-2', status: 'searching' },
    ],
    [
      { id: 'req-1', status: 'searching' },
      { id: 'req-2', status: 'searching' },
    ],
  );
  assert.deepEqual(merged, [
    { id: 'req-1', status: 'assigned', rider: { first_name: 'Ana' } },
    { id: 'req-2', status: 'searching' },
  ]);
});

test('list refresh keeps newer REST fields when status did not go backwards', () => {
  const merged = mergeDispatchRequestLists(
    [{ id: 'req-1', status: 'assigned' }],
    [{ id: 'req-1', status: 'assigned', rider: { first_name: 'Ana' } }],
  );
  assert.deepEqual(merged, [
    { id: 'req-1', status: 'assigned', rider: { first_name: 'Ana' } },
  ]);
});

test('patches matching request status from dispatch.updated', () => {
  const next = patchRequestsFromDispatchEvent(
    [
      { id: 'req-1', status: 'searching' },
      { id: 'req-2', status: 'searching' },
    ],
    { type: 'dispatch.updated', requestId: 'req-1', status: 'assigned' },
  );
  assert.deepEqual(next, [
    { id: 'req-1', status: 'assigned' },
    { id: 'req-2', status: 'searching' },
  ]);
});

test('parses delivery.service.updated', () => {
  assert.deepEqual(
    parseRestaurantDispatchSseBlock(
      'event: delivery.service.updated\ndata: {"type":"delivery.service.updated"}',
    ),
    { type: 'delivery.service.updated' },
  );
});
