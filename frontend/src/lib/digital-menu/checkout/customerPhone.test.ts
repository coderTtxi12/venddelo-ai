import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPublicOrderInput } from './buildPublicOrderInput.ts';
import {
  buildCheckoutCustomerPhoneE164,
  formatOrderCustomerPhone,
  isCustomerPhoneLocalValid,
} from './customerPhone.ts';
import type { CheckoutFulfillment } from './fulfillment.ts';

const baseFulfillment: CheckoutFulfillment = {
  serviceType: 'takeout',
  deliveryAddress: '',
  deliveryAddressDetails: '',
  deliveryLatitude: null,
  deliveryLongitude: null,
  deliveryPlaceId: null,
  deliveryFeeCents: null,
  paymentMethod: 'cash',
  customerName: 'Oliver',
  customerPhoneCountryIso: 'MX',
  customerPhoneLocal: '5512345678',
  cashDenominationCents: null,
};

test('customer phone validation requires at least 8 local digits', () => {
  assert.equal(isCustomerPhoneLocalValid('55123456'), true);
  assert.equal(isCustomerPhoneLocalValid('5512345'), false);
});

test('buildCheckoutCustomerPhoneE164 formats Mexico number', () => {
  assert.equal(buildCheckoutCustomerPhoneE164(baseFulfillment), '+525512345678');
});

test('formatOrderCustomerPhone renders E164 for dashboard display', () => {
  assert.equal(formatOrderCustomerPhone('+525512345678'), '+52 5512345678');
  assert.equal(formatOrderCustomerPhone('whatsapp'), 'Vía WhatsApp');
});

test('buildPublicOrderInput persists customer WhatsApp in API payload', () => {
  const payload = buildPublicOrderInput([], baseFulfillment, 'ABCD1234');
  assert.equal(payload.customer_phone, '+525512345678');
  assert.equal(payload.customer_name, 'Oliver');
});
