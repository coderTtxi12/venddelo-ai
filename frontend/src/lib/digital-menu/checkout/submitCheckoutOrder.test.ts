import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../../api/types.ts';
import type { PublicOrderInput } from '../../api/public.ts';
import {
  formatCheckoutSaveError,
  submitCheckoutOrder,
} from './submitCheckoutOrder.ts';

const payload: PublicOrderInput = {
  type: 'takeout',
  customer_name: 'Ana',
  customer_phone: '+525512345678',
  payment_method: 'cash',
  items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
};

test('submitCheckoutOrder waits for the API and sends the idempotency key', async () => {
  const calls: { subdomain: string; key: string | undefined }[] = [];

  const result = await submitCheckoutOrder(
    'wildrooster',
    payload,
    'key-1',
    async (subdomain, _payload, idempotencyKey) => {
      calls.push({ subdomain, key: idempotencyKey });
      return { id: 'order-1' };
    },
  );

  assert.deepEqual(result, { id: 'order-1' });
  assert.deepEqual(calls, [{ subdomain: 'wildrooster', key: 'key-1' }]);
});

test('submitCheckoutOrder retries a network error once with the same idempotency key', async () => {
  const keys: Array<string | undefined> = [];
  let attempts = 0;

  const result = await submitCheckoutOrder(
    'wildrooster',
    payload,
    'key-retry',
    async (_subdomain, _payload, idempotencyKey) => {
      keys.push(idempotencyKey);
      attempts += 1;
      if (attempts === 1) {
        throw new ApiError('network_error', 'offline', 0);
      }
      return { id: 'order-2' };
    },
  );

  assert.deepEqual(result, { id: 'order-2' });
  assert.deepEqual(keys, ['key-retry', 'key-retry']);
});

test('submitCheckoutOrder does not retry validation errors', async () => {
  let attempts = 0;
  const error = new ApiError('validation_error', 'Coupon expired', 422);

  await assert.rejects(
    () =>
      submitCheckoutOrder('wildrooster', payload, 'key-3', async () => {
        attempts += 1;
        throw error;
      }),
    error,
  );
  assert.equal(attempts, 1);
});

test('formatCheckoutSaveError uses a retry message for network failures', () => {
  assert.equal(
    formatCheckoutSaveError(new ApiError('network_error', 'offline', 0)),
    'No se pudo registrar el pedido. Revisa tu conexión e intenta de nuevo.',
  );
  assert.equal(
    formatCheckoutSaveError(new ApiError('coupon_not_found', 'Código no válido', 422)),
    'Código no válido',
  );
});
