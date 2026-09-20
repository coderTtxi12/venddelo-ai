import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publicTrackingConnectionBar,
  publicTrackingMapPendingCopy,
  publicTrackingRouteCaption,
  publicTrackingShowsLiveMap,
  publicTrackingStatusCopy,
  publicTrackingTimelineSteps,
} from './publicTrackingCopy.ts';

test('picked_up tells the customer the rider arrived at the restaurant', () => {
  const copy = publicTrackingStatusCopy.picked_up;
  assert.equal(copy.title, 'El repartidor llegó al restaurante');
  assert.equal(copy.detail, 'Está recogiendo tu pedido.');
});

test('timeline marks accepted as waiting for the restaurant', () => {
  const step = publicTrackingTimelineSteps.find((item) => item.id === 'accepted');
  assert.ok(step);
  assert.equal(step.label, 'Recibido');
  assert.equal(step.hint, 'Aún no se ha aceptado el pedido.');
  assert.equal(publicTrackingStatusCopy.accepted.title, 'Pedido recibido');
  assert.equal(
    publicTrackingStatusCopy.accepted.detail,
    'Aún no se ha aceptado el pedido. En cuanto el restaurante lo confirme, empezará a prepararlo.',
  );
});

test('timeline keeps cooking after accepted for restaurant-confirmed dispatch', () => {
  const cooking = publicTrackingTimelineSteps.find((item) => item.id === 'scheduled');
  const acceptedIndex = publicTrackingTimelineSteps.findIndex((item) => item.id === 'accepted');
  const cookingIndex = publicTrackingTimelineSteps.findIndex((item) => item.id === 'scheduled');
  assert.ok(cooking);
  assert.ok(acceptedIndex >= 0);
  assert.equal(cookingIndex, acceptedIndex + 1);
  assert.equal(cooking.label, 'Cocinando');
  assert.equal(publicTrackingStatusCopy.scheduled.title, 'Cocinando tu pedido');
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

test('live tracking map appears only after a rider is assigned', () => {
  assert.equal(publicTrackingShowsLiveMap('accepted', false), false);
  assert.equal(publicTrackingShowsLiveMap('scheduled', false), false);
  assert.equal(publicTrackingShowsLiveMap('searching', false), false);
  assert.equal(publicTrackingShowsLiveMap('offered', false), false);
  assert.equal(publicTrackingShowsLiveMap('assigned', false), false);
  assert.equal(publicTrackingShowsLiveMap('assigned', true), true);
  assert.equal(publicTrackingShowsLiveMap('picked_up', true), true);
  assert.equal(publicTrackingShowsLiveMap('in_transit', true), true);
  assert.equal(publicTrackingShowsLiveMap('delivered', true), false);
  assert.equal(publicTrackingShowsLiveMap('cancelled', true), false);
});

test('pending map copy tells the customer why the map is hidden', () => {
  assert.equal(publicTrackingMapPendingCopy.title, 'El mapa aparece cuando haya repartidor');
  assert.equal(
    publicTrackingMapPendingCopy.detail,
    'En cuanto asignemos un repartidor, aquí verás su ubicación en tiempo real.',
  );
});

const HEALTHY_CONNECTION = {
  isOnline: true,
  fetchFailed: false,
  connectingTimedOut: false,
} as const;

test('connection bar tells the customer when tracking is live or needs a reload', () => {
  assert.deepEqual(publicTrackingConnectionBar({ ...HEALTHY_CONNECTION, socketStatus: 'live' }), {
    tone: 'live',
    title: 'En vivo',
    detail: 'El estado de tu pedido se actualiza solo.',
    action: null,
  });
  assert.deepEqual(
    publicTrackingConnectionBar({ ...HEALTHY_CONNECTION, socketStatus: 'connecting' }),
    {
      tone: 'busy',
      title: 'Conectando',
      detail: 'Estamos abriendo la ubicación en vivo.',
      action: null,
    },
  );
  assert.equal(
    publicTrackingConnectionBar({ ...HEALTHY_CONNECTION, socketStatus: 'reconnecting' }).action,
    'Recargar',
  );
  assert.equal(
    publicTrackingConnectionBar({ ...HEALTHY_CONNECTION, socketStatus: 'offline' }).tone,
    'busy',
  );
});

test('connection bar prompts reload with a specific cause', () => {
  assert.deepEqual(
    publicTrackingConnectionBar({
      ...HEALTHY_CONNECTION,
      socketStatus: 'live',
      isOnline: false,
    }),
    {
      tone: 'stale',
      title: 'Sin conexión a internet',
      detail: 'Revisa tu Wi‑Fi o datos móviles e inténtalo de nuevo.',
      action: 'Recargar',
    },
  );
  assert.deepEqual(
    publicTrackingConnectionBar({
      ...HEALTHY_CONNECTION,
      socketStatus: 'live',
      fetchFailed: true,
    }),
    {
      tone: 'stale',
      title: 'No pudimos actualizar tu pedido',
      detail: 'Hubo un problema al cargar el estado. Recarga para intentarlo de nuevo.',
      action: 'Recargar',
    },
  );
  assert.deepEqual(
    publicTrackingConnectionBar({
      ...HEALTHY_CONNECTION,
      socketStatus: 'connecting',
      connectingTimedOut: true,
    }),
    {
      tone: 'stale',
      title: 'La conexión en vivo no responde',
      detail: 'Si el pedido no avanza, recarga la página.',
      action: 'Recargar',
    },
  );
  assert.deepEqual(
    publicTrackingConnectionBar({ ...HEALTHY_CONNECTION, socketStatus: 'reconnecting' }),
    {
      tone: 'stale',
      title: 'Se cortó la conexión en vivo',
      detail: 'Si el pedido no avanza, recarga la página.',
      action: 'Recargar',
    },
  );
  assert.deepEqual(
    publicTrackingConnectionBar({
      ...HEALTHY_CONNECTION,
      socketStatus: 'connecting',
      notFound: true,
    }),
    {
      tone: 'stale',
      title: 'No encontramos este rastreo',
      detail: 'El enlace puede haber caducado o no ser válido. Recarga por si fue un fallo temporal.',
      action: 'Recargar',
    },
  );
});
