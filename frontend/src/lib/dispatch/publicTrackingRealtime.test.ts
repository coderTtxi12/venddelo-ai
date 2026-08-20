import assert from 'node:assert/strict';
import test from 'node:test';

import type { PublicDispatchTracking } from '@/lib/api/dispatch';
import {
  applyTrackingLocation,
  shouldConsumeTrackingRealtime,
  trackingBroadcastTopic,
} from './publicTrackingRealtime.ts';

function snapshot(overrides: Partial<PublicDispatchTracking> = {}): PublicDispatchTracking {
  return {
    status: 'assigned',
    short_id: 'ABC12',
    restaurant_name: 'Bistro',
    customer_name: 'María',
    pickup: { latitude: 19.43, longitude: -99.13, name: 'Bistro' },
    dropoff: { latitude: 19.44, longitude: -99.14, address: 'Centro' },
    rider: {
      first_name: 'Ana',
      photo_url: null,
      plate_suffix: '123',
      vehicle_type: 'moto',
      motorcycle_brand: 'Honda',
      motorcycle_color: 'rojo',
      latitude: 19.43,
      longitude: -99.13,
      phone: '5511111111',
    },
    eta_seconds: 100,
    package_count: 1,
    payment_method: 'cash',
    collect_cents: 25000,
    cash_denomination_cents: 50000,
    ...overrides,
  };
}

test('topic uses tracking token', () => {
  assert.equal(trackingBroadcastTopic('abc'), 'tracking:abc');
});

test('consumes realtime only when visible and in progress', () => {
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'assigned', visibilityState: 'visible' }),
    true,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'assigned', visibilityState: 'hidden' }),
    false,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'delivered', visibilityState: 'visible' }),
    false,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'cancelled', visibilityState: 'visible' }),
    false,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: null, visibilityState: 'visible' }),
    false,
  );
});

test('location event patches rider coords and ignores missing rider', () => {
  const next = applyTrackingLocation(snapshot(), {
    latitude: 19.5,
    longitude: -99.2,
    eta_seconds: 42,
  });
  assert.equal(next.rider?.latitude, 19.5);
  assert.equal(next.rider?.longitude, -99.2);
  assert.equal(next.eta_seconds, 42);

  const noRider = applyTrackingLocation(snapshot({ rider: null }), {
    latitude: 19.5,
    longitude: -99.2,
    eta_seconds: 42,
  });
  assert.equal(noRider.rider, null);
  assert.equal(noRider.eta_seconds, 100);
});
