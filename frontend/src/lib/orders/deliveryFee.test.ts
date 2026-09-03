import assert from 'node:assert/strict';
import test from 'node:test';

import { customerPayableDeliveryCents, providerDeliveryFeeCents } from './deliveryFee.ts';

test('customer payable is zero when waived equals fee', () => {
  assert.equal(customerPayableDeliveryCents(4500, 4500), 0);
});

test('customer payable is full fee when no waiver', () => {
  assert.equal(customerPayableDeliveryCents(4500, 0), 4500);
});

test('provider fee falls back to waived for legacy orders', () => {
  assert.equal(providerDeliveryFeeCents(0, 4500), 4500);
  assert.equal(providerDeliveryFeeCents(4500, 4500), 4500);
  assert.equal(providerDeliveryFeeCents(0, 0), 0);
});
