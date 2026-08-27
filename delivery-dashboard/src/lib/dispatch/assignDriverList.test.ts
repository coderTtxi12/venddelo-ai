import assert from 'node:assert/strict';
import test from 'node:test';

import type { DispatchMonitorDriver } from '../api/types';
import {
  assignDriverFilterCounts,
  filterAssignDrivers,
  formatPickupDistance,
  geodesicMeters,
} from './assignDriverList';

const RESTAURANT = { lat: 19.632, lng: -99.095 };

function driver(overrides: Partial<DispatchMonitorDriver> = {}): DispatchMonitorDriver {
  return {
    id: 'driver-a',
    first_name: 'Ana',
    last_name: 'Lopez',
    phone: '555',
    is_online: true,
    status: 'active',
    plate: 'ABC',
    motorcycle_color: 'black',
    compartment_size: 'normal',
    profile_photo_path: '',
    last_lat: 19.633,
    last_lng: -99.096,
    location_updated_at: '2026-08-27T08:00:00+00:00',
    location_stale: false,
    location_age_seconds: 12,
    credit_limit_cents: 50000,
    credit_held_cents: 0,
    credit_available_cents: 50000,
    credit_blocked: false,
    active_request_id: null,
    active_request_status: null,
    open_offer_id: null,
    ...overrides,
  };
}

const near = driver({ id: 'near' });
const far = driver({
  id: 'far',
  first_name: 'Beto',
  last_lat: 19.7,
  last_lng: -99.2,
});
const offlineClose = driver({
  id: 'offline',
  first_name: 'Cora',
  is_online: false,
  last_lat: 19.6325,
  last_lng: -99.0955,
});
const onlineNoGps = driver({
  id: 'no-gps',
  first_name: 'Dina',
  last_lat: null,
  last_lng: null,
  location_stale: true,
});
const staleClose = driver({
  id: 'stale',
  first_name: 'Eva',
  last_lat: 19.6322,
  last_lng: -99.0952,
  location_stale: true,
});
const blocked = driver({
  id: 'blocked',
  first_name: 'Fito',
  status: 'blocked',
});

const pool = [far, blocked, onlineNoGps, staleClose, offlineClose, near];

test('geodesicMeters matches the assignment engine haversine', () => {
  const meters = geodesicMeters(19.633, -99.096, RESTAURANT.lat, RESTAURANT.lng);
  assert.ok(Math.abs(meters - 152.7509718405404) < 0.001);
});

test('En línea lists online riders nearest first and keeps those without GPS', () => {
  const rows = filterAssignDrivers(pool, 'online', RESTAURANT.lat, RESTAURANT.lng);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['stale', 'near', 'far', 'no-gps'],
  );
});

test('Cercanía keeps online riders the engine can rank by restaurant GPS', () => {
  const rows = filterAssignDrivers(pool, 'nearby', RESTAURANT.lat, RESTAURANT.lng);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['near', 'far'],
  );
});

test('Todos sorts closest to farthest and parks missing GPS last', () => {
  const rows = filterAssignDrivers(pool, 'all', RESTAURANT.lat, RESTAURANT.lng);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['stale', 'offline', 'near', 'far', 'no-gps'],
  );
});

test('Cercanía is empty without restaurant coordinates', () => {
  const rows = filterAssignDrivers(pool, 'nearby', null, null);
  assert.deepEqual(rows, []);
});

test('counts ignore blocked riders', () => {
  assert.deepEqual(assignDriverFilterCounts(pool, RESTAURANT.lat, RESTAURANT.lng), {
    online: 4,
    nearby: 2,
    all: 5,
  });
});

test('formatPickupDistance uses meters then km', () => {
  assert.equal(formatPickupDistance(152.75), '153 m');
  assert.equal(formatPickupDistance(13343.55), '13.3 km');
  assert.equal(formatPickupDistance(null), null);
});
