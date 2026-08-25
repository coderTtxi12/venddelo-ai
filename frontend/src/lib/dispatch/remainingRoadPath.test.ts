import assert from 'node:assert/strict';
import test from 'node:test';

import { remainingPathFrom } from './remainingRoadPath.ts';

const south = { lat: 19.4, lng: -99.13 };
const mid = { lat: 19.41, lng: -99.13 };
const north = { lat: 19.42, lng: -99.13 };
const path = [south, mid, north];

test('remainingPathFrom keeps the full road when the rider is at the start', () => {
  const remaining = remainingPathFrom(path, south);
  assert.equal(remaining[0].lat, south.lat);
  assert.equal(remaining[remaining.length - 1].lat, north.lat);
  assert.ok(remaining.length >= 3);
});

test('remainingPathFrom drops the traveled part as the rider moves north', () => {
  const remaining = remainingPathFrom(path, { lat: 19.409, lng: -99.13 });
  assert.ok(remaining[0].lat > south.lat - 0.0001);
  assert.equal(remaining[remaining.length - 1].lat, north.lat);
  assert.ok(remaining.every((point) => point.lat >= 19.408));
});

test('remainingPathFrom shrinks to the last stretch near the destination', () => {
  const remaining = remainingPathFrom(path, { lat: 19.4195, lng: -99.13 });
  assert.ok(remaining.length <= 4);
  assert.equal(remaining[remaining.length - 1].lat, north.lat);
});

test('remainingPathFrom still connects a rider slightly off the road', () => {
  const remaining = remainingPathFrom(path, { lat: 19.41, lng: -99.131 });
  assert.equal(remaining[0].lng, -99.131);
  assert.equal(remaining[remaining.length - 1].lat, north.lat);
});
