import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityKindLabel,
  customerFiltersActive,
  customerInitials,
  customerWhatsAppHref,
  filterCustomers,
  matchesCustomerQuery,
  sortCustomers,
  toggleCustomerColumnSort,
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

test('customerWhatsAppHref includes coupon and order context', () => {
  const href = customerWhatsAppHref('+525512345678', 'María', {
    couponCode: 'PIZZA20',
    orderShortId: 'A1B2C',
  });
  assert.ok(href);
  const decoded = decodeURIComponent(href!.split('text=')[1] ?? '');
  assert.match(decoded, /pedido #A1B2C/);
  assert.match(decoded, /cupón PIZZA20/);
});

test('filterCustomers matches name, digits and source', () => {
  const all = [maria, luis];
  assert.equal(filterCustomers(all, { query: 'maría' }).length, 1);
  assert.equal(filterCustomers(all, { query: '551234' })[0]?.phone_key, '5512345678');
  assert.equal(filterCustomers(all, { source: 'delivery' }).length, 1);
  assert.equal(matchesCustomerQuery(maria, 'pedro'), false);
});

test('filterCustomers supports frequency, spend and recency', () => {
  const all = [maria, luis];
  assert.equal(filterCustomers(all, { frequency: 'repeat' })[0]?.phone_key, '5512345678');
  assert.equal(filterCustomers(all, { frequency: 'new' })[0]?.phone_key, '5550001111');
  assert.equal(filterCustomers(all, { spend: 'none' }).length, 0);
  assert.equal(
    filterCustomers(all, { recency: '7d' }, Date.parse('2026-08-22T12:00:00Z')).length,
    2,
  );
  assert.equal(
    filterCustomers(all, { recency: '7d' }, Date.parse('2026-09-10T12:00:00Z')).length,
    0,
  );
  assert.equal(customerFiltersActive({ frequency: 'repeat' }), true);
  assert.equal(customerFiltersActive({}), false);
});

test('sortCustomers by spent then recency', () => {
  const sorted = sortCustomers([luis, maria], 'spent');
  assert.equal(sorted[0]?.phone_key, '5512345678');
});

test('sortCustomers respects ascending order', () => {
  assert.equal(sortCustomers([luis, maria], 'spent', 'asc')[0]?.phone_key, '5550001111');
  assert.equal(sortCustomers([luis, maria], 'name', 'desc')[0]?.customer_name, 'María López');
  assert.equal(sortCustomers([luis, maria], 'visits', 'asc')[0]?.phone_key, '5550001111');
  assert.equal(sortCustomers([luis, maria], 'last_at', 'asc')[0]?.phone_key, '5512345678');
});

test('toggleCustomerColumnSort switches column then direction', () => {
  const toVisits = toggleCustomerColumnSort({ sort: 'last_at', order: 'desc' }, 'visits');
  assert.deepEqual(toVisits, { sort: 'visits', order: 'desc' });
  assert.deepEqual(toggleCustomerColumnSort(toVisits, 'visits'), { sort: 'visits', order: 'asc' });
  assert.deepEqual(toggleCustomerColumnSort({ sort: 'visits', order: 'asc' }, 'name'), {
    sort: 'name',
    order: 'asc',
  });
});

test('visit and activity labels', () => {
  assert.equal(visitSummary(maria), '2 pedidos · 1 delivery');
  assert.equal(activityKindLabel('menu', 'takeout'), 'Menú · Para llevar');
  assert.equal(activityKindLabel('delivery', 'delivery'), 'Pedido manual');
});
