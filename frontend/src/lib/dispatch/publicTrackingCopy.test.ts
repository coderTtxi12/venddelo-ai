import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publicTrackingRouteCaption,
  publicTrackingStatusCopy,
  publicTrackingTimelineSteps,
} from './publicTrackingCopy.ts';

test('picked_up tells the customer the rider arrived at the restaurant', () => {
  const copy = publicTrackingStatusCopy.picked_up;
  assert.equal(copy.title, 'El repartidor llegó al restaurante');
  assert.equal(copy.detail, 'Está recogiendo tu pedido.');
});

test('timeline marks picked_up as at the restaurant', () => {
  const step = publicTrackingTimelineSteps.find((item) => item.id === 'picked_up');
  assert.ok(step);
  assert.equal(step.label, 'En el restaurante');
  assert.equal(step.hint, 'Está recogiendo tu pedido.');
});

test('map caption keeps picked_up at the restaurant, not en route to the customer', () => {
  assert.equal(
    publicTrackingRouteCaption('picked_up', true),
    'El repartidor está en el restaurante',
  );
  assert.equal(
    publicTrackingRouteCaption('in_transit', true),
    'El repartidor va rumbo a tu ubicación',
  );
});
