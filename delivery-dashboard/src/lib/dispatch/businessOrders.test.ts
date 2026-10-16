import assert from 'node:assert/strict';
import test from 'node:test';

import {
  businessLinePoints,
  filterBusinessOrders,
  sortBusinessOrders,
  toBusinessOrderRows,
} from './businessOrders';

test('toBusinessOrderRows fills missing buckets with zero', () => {
  const [active, quiet] = toBusinessOrderRows(
    [
      { id: 'a', name: 'Tacos', on_hold: false, order_count: 2, counts: [2] },
      { id: 'b', name: 'Pizza', on_hold: true, order_count: 0, counts: [] },
    ],
    3,
  );
  assert.deepEqual(active.counts, [2, 0, 0]);
  assert.equal(active.orderCount, 2);
  assert.deepEqual(quiet.counts, [0, 0, 0]);
  assert.equal(quiet.orderCount, 0);
  assert.equal(quiet.onHold, true);
});

test('sortBusinessOrders puts the highest count first and zeros last', () => {
  const rows = toBusinessOrderRows(
    [
      { id: 'z', name: 'Zeta', on_hold: false, order_count: 0, counts: [0] },
      { id: 'a', name: 'Alfa', on_hold: false, order_count: 4, counts: [4] },
      { id: 'b', name: 'Beta', on_hold: false, order_count: 0, counts: [0] },
    ],
    1,
  );
  assert.deepEqual(
    sortBusinessOrders(rows).map((row) => row.name),
    ['Alfa', 'Beta', 'Zeta'],
  );
});

test('filterBusinessOrders keeps hold and name search independent', () => {
  const rows = toBusinessOrderRows(
    [
      { id: '1', name: 'Tacos Norte', on_hold: false, order_count: 1, counts: [1] },
      { id: '2', name: 'Tacos Sur', on_hold: true, order_count: 0, counts: [0] },
    ],
    1,
  );
  assert.deepEqual(
    filterBusinessOrders(rows, 'hold', 'tacos').map((row) => row.id),
    ['2'],
  );
  assert.deepEqual(
    filterBusinessOrders(rows, 'active', '').map((row) => row.id),
    ['1'],
  );
});

test('businessLinePoints keeps a zero line for businesses without orders', () => {
  const rows = toBusinessOrderRows(
    [{ id: 'quiet', name: 'Quieto', on_hold: false, order_count: 0, counts: [] }],
    2,
  );
  assert.deepEqual(businessLinePoints(['09:00', '10:00'], rows), [
    { label: '09:00', quiet: 0 },
    { label: '10:00', quiet: 0 },
  ]);
});
