import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECKOUT_ORDER_ID_ALPHABET,
  CHECKOUT_ORDER_ID_LENGTH,
  createCheckoutOrderRef,
} from './createCheckoutOrderRef.ts';

test('createCheckoutOrderRef uses a 5-character delivery-style id', () => {
  const { orderId } = createCheckoutOrderRef();
  assert.equal(orderId.length, CHECKOUT_ORDER_ID_LENGTH);
  assert.ok([...orderId].every((char) => CHECKOUT_ORDER_ID_ALPHABET.includes(char)));
});
