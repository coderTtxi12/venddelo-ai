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
