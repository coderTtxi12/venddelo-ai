import assert from 'node:assert/strict';
import test from 'node:test';

import type { DispatchMonitorDriver, DispatchMonitorSnapshot } from '../api/types';
import {
  applyDriverLocationToSnapshot,
  parseDispatchMonitorSocketEvent,
} from './applyDriverLocation';

function driver(overrides: Partial<DispatchMonitorDriver> = {}): DispatchMonitorDriver {
  return {
    id: 'driver-a',
    first_name: 'Ana',
    last_name: 'Lopez',
    phone: '555',
    is_online: true,
    status: 'available',
    plate: 'ABC',
    motorcycle_color: 'black',
    compartment_size: 'M',
    profile_photo_path: '',
    last_lat: 19.4,
    last_lng: -99.1,
    location_updated_at: '2026-08-24T21:59:00+00:00',
    location_stale: true,
    location_age_seconds: 120,
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

function snapshot(drivers: DispatchMonitorDriver[]): DispatchMonitorSnapshot {
  return {
    generated_at: '2026-08-24T22:00:00+00:00',
    metrics: {
      drivers_online: drivers.filter((row) => row.is_online).length,
      drivers_offline: drivers.filter((row) => !row.is_online).length,
      drivers_location_stale: drivers.filter((row) => row.is_online && row.location_stale).length,
      requests_pending: 0,
      requests_due_search: 0,
      requests_in_progress: 0,
      offers_open: 0,
      credit_holds_active: 0,
      drivers_credit_blocked: 0,
      high_demand: false,
      requests_unassigned: 0,
    },
    drivers,
    requests: [],
    offers: [],
    credit_holds: [],
    routes: [],
  };
}

test('parses driver.location websocket payloads and ignores unknown types', () => {
  assert.deepEqual(parseDispatchMonitorSocketEvent({ type: 'monitor.updated' }), {
    type: 'monitor.updated',
  });
  assert.deepEqual(
    parseDispatchMonitorSocketEvent({
      type: 'driver.location',
      driver_id: 'driver-a',
      last_lat: 19.43,
      last_lng: -99.13,
      location_updated_at: '2026-08-24T22:00:00+00:00',
    }),
    {
      type: 'driver.location',
      driver_id: 'driver-a',
      last_lat: 19.43,
      last_lng: -99.13,
      location_updated_at: '2026-08-24T22:00:00+00:00',
    },
  );
  assert.equal(parseDispatchMonitorSocketEvent({ type: 'rider.updated' }), null);
});

test('patches one rider on the snapshot without touching other drivers or requests', () => {
  const other = driver({
    id: 'driver-b',
    last_lat: 19.5,
    last_lng: -99.2,
    location_stale: false,
    location_age_seconds: 4,
  });
  const current = snapshot([driver(), other]);
  const next = applyDriverLocationToSnapshot(
    current,
    {
      type: 'driver.location',
      driver_id: 'driver-a',
      last_lat: 19.43,
      last_lng: -99.13,
      location_updated_at: '2026-08-24T22:00:00+00:00',
    },
    Date.parse('2026-08-24T22:00:03+00:00'),
  );

  assert.equal(next.drivers[0].last_lat, 19.43);
  assert.equal(next.drivers[0].last_lng, -99.13);
  assert.equal(next.drivers[0].location_updated_at, '2026-08-24T22:00:00+00:00');
  assert.equal(next.drivers[0].location_age_seconds, 3);
  assert.equal(next.drivers[0].location_stale, false);
  assert.equal(next.drivers[1], other);
  assert.equal(next.requests, current.requests);
  assert.equal(next.metrics.drivers_location_stale, 0);
});
