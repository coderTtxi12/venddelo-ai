import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityKindLabel,
  customerInitials,
  customerWhatsAppHref,
  filterCustomers,
  matchesCustomerQuery,
  sortCustomers,
  visitSummary,
} from './display.ts';

type Customer = Parameters<typeof filterCustomers>[0][number];

const maria: Customer = {
  phone_key: '5512345678',
  customer_name: 'María López',
  customer_phone: '+525512345678',
  order_count: 2,
  delivery_count: 1,
  visit_count: 3,
  total_spent_cents: 35000,
  last_order_at: '2026-08-20T12:00:00Z',
  first_order_at: '2026-08-01T12:00:00Z',
  sources: ['menu', 'delivery'],
};

const luis: Customer = {
  phone_key: '5550001111',
  customer_name: 'Luis',
  customer_phone: '5550001111',
  order_count: 1,
  delivery_count: 0,
  visit_count: 1,
  total_spent_cents: 2000,
  last_order_at: '2026-08-21T12:00:00Z',
  first_order_at: '2026-08-21T12:00:00Z',
  sources: ['menu'],
};

test('customerInitials uses up to two letters', () => {
  assert.equal(customerInitials('María López'), 'ML');
  assert.equal(customerInitials('Ana'), 'A');
  assert.equal(customerInitials('  '), '?');
});

test('customerWhatsAppHref skips legacy placeholder', () => {
  assert.equal(customerWhatsAppHref('whatsapp', 'María'), null);
  assert.match(customerWhatsAppHref('+525512345678', 'María') ?? '', /wa\.me\/525512345678/);
});

test('filterCustomers matches name, digits and source', () => {
  const all = [maria, luis];
  assert.equal(filterCustomers(all, 'maría', 'all').length, 1);
  assert.equal(filterCustomers(all, '551234', 'all')[0]?.phone_key, '5512345678');
  assert.equal(filterCustomers(all, '', 'delivery').length, 1);
  assert.equal(matchesCustomerQuery(maria, 'pedro'), false);
});

test('sortCustomers by spent then recency', () => {
  const sorted = sortCustomers([luis, maria], 'spent');
  assert.equal(sorted[0]?.phone_key, '5512345678');
});

test('visit and activity labels', () => {
  assert.equal(visitSummary(maria), '2 pedidos · 1 delivery');
  assert.equal(activityKindLabel('menu', 'takeout'), 'Menú · Para llevar');
  assert.equal(activityKindLabel('delivery', 'delivery'), 'Delivery manual');
});
