import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECKOUT_ORDER_ID_ALPHABET,
  CHECKOUT_ORDER_ID_LENGTH,
  createCheckoutOrderRef,
  resolveCheckoutOrderRef,
} from './createCheckoutOrderRef.ts';

test('createCheckoutOrderRef uses a 5-character delivery-style id', () => {
  const { orderId } = createCheckoutOrderRef();
  assert.equal(orderId.length, CHECKOUT_ORDER_ID_LENGTH);
  assert.ok([...orderId].every((char) => CHECKOUT_ORDER_ID_ALPHABET.includes(char)));
});

test('resolveCheckoutOrderRef reuses order id and idempotency key for the same attempt', () => {
  const first = resolveCheckoutOrderRef('cart-a', null);
  const second = resolveCheckoutOrderRef('cart-a', first);

  assert.equal(second.ref.orderId, first.ref.orderId);
  assert.equal(second.ref.idempotencyKey, first.ref.idempotencyKey);
  assert.equal(second.fingerprint, 'cart-a');
});

test('resolveCheckoutOrderRef issues a new key when the cart changes', () => {
  const first = resolveCheckoutOrderRef('cart-a', null);
  const second = resolveCheckoutOrderRef('cart-b', first);

  assert.notEqual(second.ref.orderId, first.ref.orderId);
  assert.notEqual(second.ref.idempotencyKey, first.ref.idempotencyKey);
  assert.equal(second.fingerprint, 'cart-b');
});
