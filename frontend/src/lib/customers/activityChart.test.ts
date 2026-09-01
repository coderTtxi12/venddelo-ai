import assert from 'node:assert/strict';
import test from 'node:test';

import type { RestaurantCustomerActivityItem } from '@/lib/api/customers';

import {
  buildCustomActivityBuckets,
  buildWeeklyActivityBuckets,
  computeAverageOrderMetrics,
  sortActivityHistory,
} from './activityChart.ts';

const items: RestaurantCustomerActivityItem[] = [
  {
    id: '1',
    kind: 'menu',
    created_at: '2026-08-20T12:00:00Z',
    total_cents: 12000,
    status: 'delivered',
    order_type: 'delivery',
    display_id: 'AAA11',
    item_quantity: 3,
  },
  {
    id: '2',
    kind: 'menu',
    created_at: '2026-08-10T12:00:00Z',
    total_cents: 8000,
    status: 'cancelled',
    order_type: 'takeout',
    display_id: 'BBB22',
    item_quantity: 2,
  },
  {
    id: '3',
    kind: 'delivery',
    created_at: '2026-08-18T12:00:00Z',
    total_cents: 15000,
    status: 'delivered',
    order_type: 'delivery',
    display_id: 'CCC33',
    item_quantity: 1,
  },
];

test('buildWeeklyActivityBuckets groups by week ending anchor week', () => {
  const buckets = buildWeeklyActivityBuckets(items, new Date('2026-08-22T12:00:00Z'));
  assert.equal(buckets.length, 8);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  assert.equal(total, 3);
});

test('buildCustomActivityBuckets uses daily buckets for short ranges', () => {
  const buckets = buildCustomActivityBuckets(items, '2026-08-09', '2026-08-21');
  assert.ok(buckets.length >= 10);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 3);
});

test('sortActivityHistory supports date and amount', () => {
  const byAmountDesc = sortActivityHistory(items, 'amount-desc');
  assert.equal(byAmountDesc[0]?.display_id, 'CCC33');
  const byDateAsc = sortActivityHistory(items, 'date-asc');
  assert.equal(byDateAsc[0]?.display_id, 'BBB22');
});

test('computeAverageOrderMetrics uses delivered tickets and item counts', () => {
  const metrics = computeAverageOrderMetrics(items);
  assert.equal(metrics.avgTicketCents, 13500);
  assert.equal(metrics.avgItemQuantity, 2);
});
