import assert from 'node:assert/strict';
import test from 'node:test';

import { cartLinesToQuoteInput } from './cartQuotePayload.ts';

test('includes coupon and fulfillment', () => {
  const payload = cartLinesToQuoteInput(
    [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'Pizza',
        quantity: 1,
        selections: {},
        imagePath: null,
        notes: null,
        unitPriceCents: 1000,
      },
    ],
    { couponCode: 'pizza20', serviceType: 'delivery', deliveryFeeCents: 4500 },
  );
  assert.equal(payload.coupon_code, 'PIZZA20');
  assert.equal(payload.service_type, 'delivery');
  assert.equal(payload.delivery_fee_cents, 4500);
});

test('omits empty coupon code', () => {
  const payload = cartLinesToQuoteInput(
    [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'Pizza',
        quantity: 1,
        selections: {},
        imagePath: null,
        notes: null,
        unitPriceCents: 1000,
      },
    ],
    { couponCode: '  ' },
  );
  assert.equal(payload.coupon_code, undefined);
});
