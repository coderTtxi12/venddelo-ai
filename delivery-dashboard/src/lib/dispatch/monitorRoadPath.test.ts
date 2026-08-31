import assert from 'node:assert/strict';
import test from 'node:test';

import { densifyStraightPath, monitorRestaurantRiderLegs, monitorRestaurantSpokes, resolveMonitorRoadPath } from './monitorRoadPath';

const origin = { lat: 19.43, lng: -99.13 };
const destination = { lat: 19.44, lng: -99.14 };
const road = [origin, { lat: 19.435, lng: -99.135 }, destination];

test('densifyStraightPath adds vertices so dashed polylines can render', () => {
  const path = densifyStraightPath(origin, destination);
  assert.equal(path[0].lat, origin.lat);
  assert.equal(path[path.length - 1].lng, destination.lng);
  assert.ok(path.length > 2);
});

test('does not call Directions when no pedido is focused', async () => {
  let calls = 0;
  const path = await resolveMonitorRoadPath({
    requestId: 'req-1',
    focusedRequestId: null,
    origin,
    destination,
    loadRoad: async () => {
      calls += 1;
      return road;
    },
  });
  assert.equal(calls, 0);
  assert.equal(path[0].lat, origin.lat);
  assert.equal(path[path.length - 1].lng, destination.lng);
  assert.ok(path.length > 2);
});

test('does not call Directions for pedidos that are not focused', async () => {
  let calls = 0;
  const path = await resolveMonitorRoadPath({
    requestId: 'req-1',
    focusedRequestId: 'req-2',
    origin,
    destination,
    loadRoad: async () => {
      calls += 1;
      return road;
    },
  });
  assert.equal(calls, 0);
  assert.equal(path.length, densifyStraightPath(origin, destination).length);
});

test('calls Directions only for the focused pedido', async () => {
  let calls = 0;
  const path = await resolveMonitorRoadPath({
    requestId: 'req-1',
    focusedRequestId: 'req-1',
    origin,
    destination,
    loadRoad: async () => {
      calls += 1;
      return road;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(path, road);
});

test('reuses the cached road when the same pedido is focused again', async () => {
  let calls = 0;
  const cache = new Map<string, Promise<typeof road>>();
  const loadRoad = () => {
    const key = 'req-1';
    const cached = cache.get(key);
    if (cached) return cached;
    calls += 1;
    const pending = Promise.resolve(road);
    cache.set(key, pending);
    return pending;
  };

  await resolveMonitorRoadPath({
    requestId: 'req-1',
    focusedRequestId: 'req-1',
    origin,
    destination,
    loadRoad,
  });
  const second = await resolveMonitorRoadPath({
    requestId: 'req-1',
    focusedRequestId: 'req-1',
    origin,
    destination,
    loadRoad,
  });

  assert.equal(calls, 1);
  assert.deepEqual(second, road);
});

test('focused business draws a straight spoke to every live dropoff', () => {
  const otherDropoff = { lat: 19.45, lng: -99.12 };
  const spokes = monitorRestaurantSpokes(
    [
      {
        id: 'queued',
        status: 'searching',
        restaurant_id: 'rest-1',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
      },
      {
        id: 'active',
        status: 'in_transit',
        restaurant_id: 'rest-1',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: otherDropoff.lat,
        dropoff_lng: otherDropoff.lng,
      },
      {
        id: 'other-shop',
        status: 'searching',
        restaurant_id: 'rest-2',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
      },
    ],
    'rest-1',
  );

  assert.deepEqual(
    spokes.map((row) => row.requestId),
    ['queued', 'active'],
  );
  assert.equal(spokes[0].origin.lat, origin.lat);
  assert.equal(spokes[1].destination.lat, otherDropoff.lat);
});

test('no restaurant focus yields no business spokes', () => {
  const spokes = monitorRestaurantSpokes(
    [
      {
        id: 'queued',
        status: 'searching',
        restaurant_id: 'rest-1',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
      },
    ],
    null,
  );
  assert.equal(spokes.length, 0);
});

test('focused business draws a straight rider leg to restaurant or dropoff', () => {
  const rider = { lat: 19.42, lng: -99.125 };
  const legs = monitorRestaurantRiderLegs(
    [
      {
        id: 'pickup',
        status: 'assigned',
        restaurant_id: 'rest-1',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
        assigned_driver_id: 'drv-1',
      },
      {
        id: 'deliver',
        status: 'in_transit',
        restaurant_id: 'rest-1',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
        assigned_driver_id: 'drv-2',
      },
      {
        id: 'queued',
        status: 'searching',
        restaurant_id: 'rest-1',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
        assigned_driver_id: null,
      },
      {
        id: 'other-shop',
        status: 'assigned',
        restaurant_id: 'rest-2',
        restaurant_lat: origin.lat,
        restaurant_lng: origin.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
        assigned_driver_id: 'drv-3',
      },
    ],
    [
      { id: 'drv-1', last_lat: rider.lat, last_lng: rider.lng },
      { id: 'drv-2', last_lat: 19.41, last_lng: -99.11 },
      { id: 'drv-3', last_lat: 19.4, last_lng: -99.1 },
    ],
    'rest-1',
  );

  assert.deepEqual(
    legs.map((row) => row.requestId),
    ['pickup', 'deliver'],
  );
  assert.equal(legs[0].origin.lat, rider.lat);
  assert.equal(legs[0].destination.lat, origin.lat);
  assert.equal(legs[1].destination.lat, destination.lat);
});
