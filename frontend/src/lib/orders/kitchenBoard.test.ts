import assert from 'node:assert/strict';
import test from 'node:test';

import type { Order, OrderStatusSummary } from '@/lib/api/types';
import {
  applyKitchenBoardCleared,
  applyKitchenBoardClearedToSummary,
  isClearedFromKitchen,
  kitchenBulkActions,
  kitchenClosedCount,
} from './kitchenBoard.ts';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: '11111111-2222-3333-4444-555555555555',
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
    status: 'pending',
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

test('applyKitchenBoardCleared keeps active tickets and drops closed ones', () => {
  const next = applyKitchenBoardCleared([
    order({ id: '1', status: 'pending' }),
    order({ id: '2', status: 'delivered' }),
    order({ id: '3', status: 'cancelled' }),
    order({ id: '4', status: 'ready' }),
  ]);
  assert.deepEqual(
    next.map((row) => row.id),
    ['1', '4'],
  );
});

test('applyKitchenBoardClearedToSummary zeros closed kitchen counts', () => {
  const summary: OrderStatusSummary = {
    pending: 2,
    confirmed: 1,
    preparing: 0,
    ready: 1,
    delivered: 8,
    cancelled: 3,
    active: 4,
    total: 15,
    delivery: 0,
  };
  const next = applyKitchenBoardClearedToSummary(summary);
  assert.equal(next.delivered, 0);
  assert.equal(next.cancelled, 0);
  assert.equal(next.active, 4);
  assert.equal(next.total, 4);
  assert.equal(kitchenClosedCount(summary), 11);
});

test('kitchenBulkActions only cancel on nuevos and advance on later steps', () => {
  assert.deepEqual(kitchenBulkActions('new'), {
    canSelect: true,
    canCancel: true,
    advanceLabel: null,
    advanceStatus: null,
  });
  assert.equal(kitchenBulkActions('confirmed').advanceStatus, 'preparing');
  assert.equal(kitchenBulkActions('preparing').advanceLabel, 'Marcar listos');
  assert.equal(kitchenBulkActions('ready').advanceStatus, 'delivered');
  assert.equal(kitchenBulkActions('active').canSelect, false);
});

test('isClearedFromKitchen uses kds_cleared_at', () => {
  assert.equal(isClearedFromKitchen(order({ kds_cleared_at: null })), false);
  assert.equal(isClearedFromKitchen(order({ kds_cleared_at: '2026-08-21T18:00:00Z' })), true);
});
