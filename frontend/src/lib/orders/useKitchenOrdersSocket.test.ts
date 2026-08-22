import assert from 'node:assert/strict';
import test from 'node:test';

import type { Order } from '@/lib/api/types';
import { applyKitchenOrderSocketEvent } from './useKitchenOrdersSocket.ts';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: '1',
    restaurant_id: 'rest-1',
    type: 'takeout',
    customer_name: 'Ana',
    customer_phone: '+525512345678',
    payment_method: 'cash',
    subtotal_cents: 1000,
    subtotal_before_discount_cents: 1000,
    discount_cents: 0,
    total_cents: 1000,
    applied_order_promotion_id: null,
    applied_order_discounts: [],
    status: 'delivered',
    delivery_address: null,
    delivery_latitude: null,
    delivery_longitude: null,
    delivery_fee_cents: 0,
    cash_denomination_cents: null,
    cancellation_reason: null,
    idempotency_key: null,
    note: null,
    kds_cleared_at: null,
    created_at: '2026-08-21T12:00:00Z',
    updated_at: '2026-08-21T12:00:00Z',
    items: [],
    ...overrides,
  };
}

test('kitchen.board_cleared drops closed tickets from the live board', () => {
  const next = applyKitchenOrderSocketEvent(
    [
      order({ id: 'a', status: 'pending' }),
      order({ id: 'b', status: 'delivered' }),
      order({ id: 'c', status: 'cancelled' }),
    ],
    { type: 'kitchen.board_cleared', cleared_count: 2 },
  );
  assert.deepEqual(
    next.map((row) => row.id),
    ['a'],
  );
});

test('updated orders with kds_cleared_at leave the kitchen board', () => {
  const current = [order({ id: 'b', status: 'delivered' })];
  const next = applyKitchenOrderSocketEvent(current, {
    type: 'order.updated',
    order: order({ id: 'b', status: 'delivered', kds_cleared_at: '2026-08-21T18:00:00Z' }),
  });
  assert.equal(next.length, 0);
});
