import assert from 'node:assert/strict';
import test from 'node:test';

import type { Order } from '@/lib/api/types';
import {
  centsToPesosInput,
  kitchenConfirmOpensDispatch,
  orderToDispatchFormValues,
  requestRiderThenConfirmOrder,
  splitDeliveryAddress,
} from './kitchenDispatch.ts';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    restaurant_id: 'rest-1',
    type: 'delivery',
    customer_name: 'María López',
    customer_phone: '+525512345678',
    payment_method: 'cash',
    subtotal_cents: 18000,
    subtotal_before_discount_cents: 18000,
    discount_cents: 0,
    total_cents: 22500,
    applied_order_promotion_id: null,
    applied_order_discounts: [],
    status: 'pending',
    delivery_address: 'Calle Reforma 100\nReferencias: puerta azul',
    delivery_latitude: 19.4326,
    delivery_longitude: -99.1332,
    delivery_fee_cents: 4500,
    cash_denomination_cents: 50000,
    cancellation_reason: null,
    idempotency_key: null,
    note: null,
    created_at: '2026-08-20T12:00:00Z',
    updated_at: '2026-08-20T12:00:00Z',
    items: [],
    ...overrides,
  };
}

test('splitDeliveryAddress separates checkout referencias', () => {
  assert.deepEqual(splitDeliveryAddress('Calle Reforma 100\nReferencias: puerta azul'), {
    address: 'Calle Reforma 100',
    references: 'puerta azul',
  });
});

test('splitDeliveryAddress keeps plain address', () => {
  assert.deepEqual(splitDeliveryAddress('Calle Reforma 100'), {
    address: 'Calle Reforma 100',
    references: '',
  });
});

test('centsToPesosInput converts centavos to input pesos', () => {
  assert.equal(centsToPesosInput(18000), '180');
  assert.equal(centsToPesosInput(15050), '150.5');
});

test('orderToDispatchFormValues prefills delivery cash order without shipping fee', () => {
  const values = orderToDispatchFormValues(baseOrder());
  assert.equal(values.customerName, 'María López');
  assert.equal(values.phoneCountryIso, 'MX');
  assert.equal(values.phoneLocal, '5512345678');
  assert.equal(values.address, 'Calle Reforma 100');
  assert.equal(values.addressReferences, 'puerta azul');
  assert.equal(values.latitude, 19.4326);
  assert.equal(values.longitude, -99.1332);
  assert.equal(values.paymentMethod, 'cash');
  assert.equal(values.collectAmount, '180');
  assert.equal(values.cashDenomination, '500');
});

test('orderToDispatchFormValues omits collect denomination for transfer', () => {
  const values = orderToDispatchFormValues(
    baseOrder({ payment_method: 'transfer', cash_denomination_cents: null }),
  );
  assert.equal(values.paymentMethod, 'transfer');
  assert.equal(values.collectAmount, '180');
  assert.equal(values.cashDenomination, '');
});

test('kitchenConfirmOpensDispatch only for pending delivery', () => {
  assert.equal(kitchenConfirmOpensDispatch(baseOrder()), true);
  assert.equal(kitchenConfirmOpensDispatch(baseOrder({ type: 'takeout' })), false);
  assert.equal(kitchenConfirmOpensDispatch(baseOrder({ status: 'confirmed' })), false);
});

test('requestRiderThenConfirmOrder does not confirm when create fails', async () => {
  let confirmed = false;
  const result = await requestRiderThenConfirmOrder({
    createDispatch: async () => {
      throw new Error('dispatch down');
    },
    confirmOrder: async () => {
      confirmed = true;
      return { id: 'order' };
    },
  });
  assert.equal(result.status, 'create_failed');
  assert.equal(confirmed, false);
});

test('requestRiderThenConfirmOrder confirms after successful create', async () => {
  const calls: string[] = [];
  const result = await requestRiderThenConfirmOrder({
    createDispatch: async () => {
      calls.push('create');
      return { id: 'req-1' };
    },
    confirmOrder: async () => {
      calls.push('confirm');
      return { id: 'order-1' };
    },
  });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.request.id, 'req-1');
    assert.equal(result.order.id, 'order-1');
  }
  assert.deepEqual(calls, ['create', 'confirm']);
});

test('requestRiderThenConfirmOrder keeps request when confirm fails', async () => {
  const result = await requestRiderThenConfirmOrder({
    createDispatch: async () => ({ id: 'req-1' }),
    confirmOrder: async () => {
      throw new Error('status patch failed');
    },
  });
  assert.equal(result.status, 'confirm_failed');
  if (result.status === 'confirm_failed') {
    assert.equal(result.request.id, 'req-1');
  }
});
