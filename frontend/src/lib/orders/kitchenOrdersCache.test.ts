import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearKitchenOrdersCacheForTests,
  getKitchenOrdersCache,
  invalidateKitchenOrdersCache,
  KITCHEN_ORDERS_CACHE_TTL_MS,
  setKitchenOrdersCache,
} from './kitchenOrdersCache.ts';
import { EMPTY_ORDER_STATUS_SUMMARY } from './orderStatus.ts';

test('getKitchenOrdersCache returns null after TTL expires', () => {
  clearKitchenOrdersCacheForTests();
  const now = 1_000_000;
  setKitchenOrdersCache(
    'rest-1',
    'new',
    {
      orders: [],
      nextCursor: null,
      hasMore: false,
      summary: EMPTY_ORDER_STATUS_SUMMARY,
    },
    now,
  );

  assert.ok(getKitchenOrdersCache('rest-1', 'new', now));
  assert.equal(
    getKitchenOrdersCache('rest-1', 'new', now + KITCHEN_ORDERS_CACHE_TTL_MS + 1),
    null,
  );
});

test('invalidateKitchenOrdersCache clears only target restaurant', () => {
  clearKitchenOrdersCacheForTests();
  setKitchenOrdersCache('rest-1', 'new', {
    orders: [],
    nextCursor: null,
    hasMore: false,
    summary: EMPTY_ORDER_STATUS_SUMMARY,
  });
  setKitchenOrdersCache('rest-2', 'new', {
    orders: [],
    nextCursor: null,
    hasMore: false,
    summary: EMPTY_ORDER_STATUS_SUMMARY,
  });

  invalidateKitchenOrdersCache('rest-1');

  assert.equal(getKitchenOrdersCache('rest-1', 'new'), null);
  assert.ok(getKitchenOrdersCache('rest-2', 'new'));
});
