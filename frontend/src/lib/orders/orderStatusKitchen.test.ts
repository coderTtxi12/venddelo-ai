import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyOrderStatusSummaryDelta,
  buildFilterCountsFromSummary,
  orderFilterToApiParams,
  orderStatusSummaryTransitionKey,
} from './orderStatus.ts';

test('orderFilterToApiParams maps kitchen filters to API query', () => {
  assert.deepEqual(orderFilterToApiParams('new'), { status: 'pending' });
  assert.deepEqual(orderFilterToApiParams('active'), { view: 'active' });
  assert.deepEqual(orderFilterToApiParams('confirmed'), { status: 'confirmed' });
  assert.deepEqual(orderFilterToApiParams('all'), {});
});

test('buildFilterCountsFromSummary exposes chip counts', () => {
  const counts = buildFilterCountsFromSummary({
    pending: 2,
    confirmed: 1,
    preparing: 0,
    ready: 3,
    delivered: 10,
    cancelled: 1,
    active: 6,
    total: 17,
  });

  assert.equal(counts.new, 2);
  assert.equal(counts.active, 6);
  assert.equal(counts.all, 17);
});

test('applyOrderStatusSummaryDelta moves counts between statuses', () => {
  const summary = {
    pending: 2,
    confirmed: 1,
    preparing: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    active: 3,
    total: 3,
  };

  const next = applyOrderStatusSummaryDelta(summary, 'pending', 'confirmed');

  assert.equal(next.pending, 1);
  assert.equal(next.confirmed, 2);
  assert.equal(next.active, 3);
  assert.equal(next.total, 3);
});

test('orderStatusSummaryTransitionKey dedupes duplicate pending→confirmed updates', () => {
  const orderId = 'order-123';
  const key = orderStatusSummaryTransitionKey(orderId, 'pending', 'confirmed');
  const applied = new Set<string>();

  assert.equal(key, `${orderId}:pending:confirmed`);
  assert.equal(applied.has(key), false);
  applied.add(key);
  assert.equal(applied.has(key), true);

  let summary = {
    pending: 1,
    confirmed: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    active: 1,
    total: 1,
  };

  summary = applyOrderStatusSummaryDelta(summary, 'pending', 'confirmed');
  assert.equal(summary.confirmed, 1);

  if (!applied.has(key)) {
    summary = applyOrderStatusSummaryDelta(summary, 'pending', 'confirmed');
  }
  assert.equal(summary.confirmed, 1);
});
