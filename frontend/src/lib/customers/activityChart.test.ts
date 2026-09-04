import assert from 'node:assert/strict';
import test from 'node:test';

import type { RestaurantCustomerActivityItem } from '@/lib/api/customers';

import {
  buildActivityChartBuckets,
  buildCustomActivityBuckets,
  buildLast7DaysBuckets,
  buildMonthlyActivityBuckets,
  buildWeeklyActivityBuckets,
  computeAverageOrderMetrics,
  resolveOrderDeliveryMapsUrl,
  resolveOrderDeliveryPinUrl,
  sortActivityHistory,
  timelineFromItems,
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

const points = timelineFromItems(items);

test('buildWeeklyActivityBuckets groups by week ending anchor week', () => {
  const buckets = buildWeeklyActivityBuckets(points, new Date('2026-08-22T12:00:00Z'));
  assert.equal(buckets.length, 8);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  assert.equal(total, 3);
  assert.ok(buckets.every((bucket) => bucket.shortLabel.length > 0));
});

test('buildLast7DaysBuckets returns seven daily buckets', () => {
  const buckets = buildLast7DaysBuckets(points, new Date('2026-08-22T12:00:00Z'));
  assert.equal(buckets.length, 7);
});

test('buildMonthlyActivityBuckets returns six monthly buckets', () => {
  const buckets = buildMonthlyActivityBuckets(points, new Date('2026-08-22T12:00:00Z'));
  assert.equal(buckets.length, 6);
});

test('buildCustomActivityBuckets uses daily buckets for short ranges', () => {
  const buckets = buildCustomActivityBuckets(points, '2026-08-09', '2026-08-21');
  assert.ok(buckets.length >= 10);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 3);
});

test('buildCustomActivityBuckets handles timezone-safe date inputs', () => {
  const buckets = buildCustomActivityBuckets(
    [{ created_at: '2026-08-20T02:00:00Z' }],
    '2026-08-19',
    '2026-08-20',
  );
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 1);
});

test('buildActivityChartBuckets selects mode builders', () => {
  assert.equal(buildActivityChartBuckets('7d', points).length, 7);
  assert.equal(buildActivityChartBuckets('week', points).length, 8);
  assert.equal(buildActivityChartBuckets('month', points).length, 6);
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

test('resolveOrderDeliveryPinUrl prefers lat/lng google maps link', () => {
  assert.equal(
    resolveOrderDeliveryPinUrl({
      delivery_latitude: 19.4326,
      delivery_longitude: -99.1332,
    }),
    'https://www.google.com/maps?q=19.4326,-99.1332',
  );
  assert.equal(
    resolveOrderDeliveryPinUrl({
      delivery_latitude: null,
      delivery_longitude: -99.1332,
    }),
    null,
  );
});

test('resolveOrderDeliveryMapsUrl falls back to address search', () => {
  assert.equal(
    resolveOrderDeliveryMapsUrl({
      delivery_address: 'Av Reforma 1',
      delivery_latitude: null,
      delivery_longitude: null,
    }),
    'https://www.google.com/maps/search/?api=1&query=Av%20Reforma%201',
  );
  assert.equal(
    resolveOrderDeliveryMapsUrl({
      delivery_address: 'Av Reforma 1',
      delivery_latitude: 19.4,
      delivery_longitude: -99.1,
    }),
    'https://www.google.com/maps?q=19.4,-99.1',
  );
});
