import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isCashDenominationValid,
  needsCashDenomination,
  parseCashDenominationInput,
  suggestedCashDenominations,
} from './cashDenomination.ts';
import type { CheckoutFulfillment } from './fulfillment.ts';

const deliveryCashFulfillment: CheckoutFulfillment = {
  serviceType: 'delivery',
  deliveryAddress: 'Calle 1',
  deliveryAddressDetails: '',
  deliveryLatitude: 19.0,
  deliveryLongitude: -99.0,
  deliveryPlaceId: null,
  deliveryFeeCents: 3500,
  paymentMethod: 'cash',
  customerName: 'Oliver',
  customerPhoneCountryIso: 'MX',
  customerPhoneLocal: '5512345678',
  cashDenominationCents: null,
};

test('needsCashDenomination only for delivery cash', () => {
  assert.equal(needsCashDenomination(deliveryCashFulfillment), true);
  assert.equal(
    needsCashDenomination({ ...deliveryCashFulfillment, paymentMethod: 'transfer' }),
    false,
  );
  assert.equal(
    needsCashDenomination({ ...deliveryCashFulfillment, serviceType: 'takeout' }),
    false,
  );
});

test('suggestedCashDenominations returns bills covering order total', () => {
  assert.deepEqual(suggestedCashDenominations(25900), [50000, 100000]);
  assert.deepEqual(suggestedCashDenominations(95000), [100000]);
});

test('isCashDenominationValid enforces minimum order total', () => {
  assert.equal(isCashDenominationValid(50000, 25900), true);
  assert.equal(isCashDenominationValid(20000, 25900), false);
  assert.equal(isCashDenominationValid(null, 25900), false);
});

test('parseCashDenominationInput converts pesos to centavos', () => {
  assert.equal(parseCashDenominationInput('500'), 50000);
  assert.equal(parseCashDenominationInput(''), null);
});
