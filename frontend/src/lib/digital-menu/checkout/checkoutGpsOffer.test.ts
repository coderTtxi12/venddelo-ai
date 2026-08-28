import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECKOUT_GPS_COPY,
  checkoutGpsErrorMessage,
  resolveCheckoutGpsOffer,
} from './checkoutGpsOffer.ts';

const ready = {
  geolocationAvailable: true,
  mapsApiAvailable: true,
  hasCoordinates: false,
  offerDismissed: false,
};

test('resolveCheckoutGpsOffer shows card when empty and GPS ready', () => {
  assert.equal(resolveCheckoutGpsOffer(ready), 'card');
});

test('resolveCheckoutGpsOffer shows button when coordinates exist', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, hasCoordinates: true }), 'button');
});

test('resolveCheckoutGpsOffer shows button after dismiss', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, offerDismissed: true }), 'button');
});

test('resolveCheckoutGpsOffer hides when geolocation unavailable', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, geolocationAvailable: false }), 'none');
});

test('resolveCheckoutGpsOffer hides when Maps API missing', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, mapsApiAvailable: false }), 'none');
});

test('checkoutGpsErrorMessage maps denied and unavailable', () => {
  assert.equal(checkoutGpsErrorMessage('denied'), CHECKOUT_GPS_COPY.denied);
  assert.equal(checkoutGpsErrorMessage('unavailable'), CHECKOUT_GPS_COPY.unavailable);
  assert.equal(checkoutGpsErrorMessage('unsupported'), null);
});

test('CHECKOUT_GPS_COPY matches spec wording', () => {
  assert.equal(CHECKOUT_GPS_COPY.cardTitle, '¿Usar tu ubicación?');
  assert.equal(
    CHECKOUT_GPS_COPY.cardBody,
    'Llenamos tu domicilio automáticamente. Es opcional; después puedes ajustar el pin.',
  );
  assert.equal(CHECKOUT_GPS_COPY.allow, 'Permitir ubicación');
  assert.equal(CHECKOUT_GPS_COPY.writeInstead, 'Prefiero escribirla');
  assert.equal(CHECKOUT_GPS_COPY.useLocation, 'Usar mi ubicación');
  assert.equal(CHECKOUT_GPS_COPY.requesting, 'Obteniendo tu ubicación…');
  assert.equal(CHECKOUT_GPS_COPY.denied, 'No se usó la ubicación. Busca tu domicilio abajo.');
  assert.equal(
    CHECKOUT_GPS_COPY.unavailable,
    'No encontramos tu GPS. Búscalo o inténtalo de nuevo.',
  );
});
