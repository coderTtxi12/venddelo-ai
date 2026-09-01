import assert from 'node:assert/strict';
import test from 'node:test';

import type { RestaurantCustomer, RestaurantCustomerActivityItem } from '@/lib/api/customers';

import {
  activityItemCountsTowardSpend,
  classifyActivityStatus,
  summarizeCustomerActivity,
} from './activitySummary.ts';

const customer: RestaurantCustomer = {
  phone_key: '5512345678',
  customer_name: 'María',
  customer_phone: '+525512345678',
  order_count: 2,
  delivery_count: 1,
  visit_count: 3,
  total_spent_cents: 35000,
  last_order_at: '2026-08-20T12:00:00Z',
  first_order_at: '2026-08-01T12:00:00Z',
  sources: ['menu', 'delivery'],
};

const items: RestaurantCustomerActivityItem[] = [
  {
    id: '1',
    kind: 'menu',
    created_at: '2026-08-20T12:00:00Z',
    total_cents: 12000,
    status: 'delivered',
    order_type: 'takeout',
    display_id: 'AAA11',
  },
  {
    id: '2',
    kind: 'menu',
    created_at: '2026-08-10T12:00:00Z',
    total_cents: 8000,
    status: 'cancelled',
    order_type: 'takeout',
    display_id: 'BBB22',
  },
  {
    id: '3',
    kind: 'delivery',
    created_at: '2026-07-15T12:00:00Z',
    total_cents: 15000,
    status: 'delivered',
    order_type: 'delivery',
    display_id: 'CCC33',
  },
];

test('classifyActivityStatus groups delivered cancelled and in progress', () => {
  assert.equal(classifyActivityStatus('delivered'), 'delivered');
  assert.equal(classifyActivityStatus('cancelled'), 'cancelled');
  assert.equal(classifyActivityStatus('preparing'), 'in_progress');
});

test('summarizeCustomerActivity counts channels statuses spend and months', () => {
  const summary = summarizeCustomerActivity(customer, items);
  assert.equal(summary.menuCount, 2);
  assert.equal(summary.deliveryCount, 1);
  assert.equal(summary.statusCounts.delivered, 2);
  assert.equal(summary.statusCounts.cancelled, 1);
  assert.equal(summary.deliveredSpentCents, 27000);
  assert.equal(summary.monthlyActivity.length, 6);
  assert.equal(summary.monthlyActivity.at(-1)?.count, 2);
});

test('activityItemCountsTowardSpend only accepts delivered', () => {
  assert.equal(activityItemCountsTowardSpend('delivered'), true);
  assert.equal(activityItemCountsTowardSpend('cancelled'), false);
});
