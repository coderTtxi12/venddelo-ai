import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEXY_ON_HOLD_DETAIL,
  MEXY_ON_HOLD_TITLE,
  mexyOnHoldWhatsAppUrl,
} from './mexyOnHold.ts';
import { restaurantCourierServiceNotice } from '../courierUnavailableCopy.ts';

test('mexyOnHoldWhatsAppUrl uses Mexico country code', () => {
  assert.equal(mexyOnHoldWhatsAppUrl(), 'https://wa.me/525574277066');
});

test('hold copy does not mention billing or weekly fee', () => {
  const blob = `${MEXY_ON_HOLD_TITLE} ${MEXY_ON_HOLD_DETAIL}`.toLowerCase();
  assert.equal(blob.includes('seman'), false);
  assert.equal(blob.includes('pago'), false);
});

test('restaurantCourierServiceNotice returns null when on hold', () => {
  assert.equal(
    restaurantCourierServiceNotice({
      available: false,
      reason: 'Mexy pausó las entregas de tu negocio. Escríbenos por WhatsApp para reactivarlas.',
      weather_mode: 'none',
      on_hold: true,
    }),
    null,
  );
});
