import assert from 'node:assert/strict';
import test from 'node:test';

import { densifyStraightPath, resolveMonitorRoadPath } from './monitorRoadPath';

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
