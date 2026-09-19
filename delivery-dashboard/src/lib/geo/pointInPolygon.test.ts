import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPointInGeoJsonPolygon,
  parseCoordinateInput,
  parseCoordinatePair,
} from './pointInPolygon';
import type { GeoJsonPolygon } from '@/lib/onboarding/types';

const square: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-99.2, 19.4],
      [-99.1, 19.4],
      [-99.1, 19.5],
      [-99.2, 19.5],
      [-99.2, 19.4],
    ],
  ],
};

test('isPointInGeoJsonPolygon detects inside point', () => {
  assert.equal(isPointInGeoJsonPolygon(19.45, -99.15, square), true);
});

test('isPointInGeoJsonPolygon detects outside point', () => {
  assert.equal(isPointInGeoJsonPolygon(19.3, -99.15, square), false);
});

test('isPointInGeoJsonPolygon returns false for invalid polygon', () => {
  assert.equal(isPointInGeoJsonPolygon(19.45, -99.15, null), false);
  assert.equal(
    isPointInGeoJsonPolygon(19.45, -99.15, { type: 'Polygon', coordinates: [[]] }),
    false,
  );
});

test('parseCoordinatePair accepts decimal values', () => {
  const result = parseCoordinatePair('19.4326', '-99.1332');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.latitude, 19.4326);
    assert.equal(result.longitude, -99.1332);
  }
});

test('parseCoordinateInput accepts comma-separated values', () => {
  const result = parseCoordinateInput('19.4326, -99.1332');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.latitude, 19.4326);
    assert.equal(result.longitude, -99.1332);
  }
});

test('parseCoordinatePair rejects out-of-range latitude', () => {
  const result = parseCoordinatePair('95', '-99.1');
  assert.equal(result.ok, false);
});
