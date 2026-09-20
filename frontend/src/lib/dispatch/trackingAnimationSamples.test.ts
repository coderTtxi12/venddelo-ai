import assert from 'node:assert/strict';
import test from 'node:test';

import { TRACKING_ANIMATION_SAMPLES } from './trackingAnimationSamples.ts';

test('tracking animation samples follow the customer journey in order', () => {
  assert.deepEqual(
    TRACKING_ANIMATION_SAMPLES.map((sample) => sample.state),
    ['accepted', 'scheduled', 'searching'],
  );
});

test('tracking animation samples use the approved customer-facing copy', () => {
  assert.deepEqual(
    TRACKING_ANIMATION_SAMPLES.map(({ title, detail }) => ({ title, detail })),
    [
      {
        title: 'Pedido aceptado',
        detail: 'El restaurante ya aceptó tu pedido.',
      },
      {
        title: 'Preparando tu pedido',
        detail: 'El negocio está preparando tu pedido.',
      },
      {
        title: 'Buscando repartidor',
        detail: 'Estamos buscando al repartidor más cercano.',
      },
    ],
  );
});
