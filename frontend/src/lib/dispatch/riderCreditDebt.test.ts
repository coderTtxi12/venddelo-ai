import assert from 'node:assert/strict';
import test from 'node:test';

import type { DispatchRequest } from '../api/dispatch.ts';
import {
  groupHeldRiderCredit,
  hasHeldRiderCredit,
  totalHeldRiderCreditCents,
  wasRiderCreditReleased,
} from './riderCreditDebt.ts';

function request(overrides: Partial<DispatchRequest>): DispatchRequest {
  return {
    id: 'r1',
    customer_name: 'Ana',
    customer_phone: '+525511111111',
    dropoff_lat: 19.4,
    dropoff_lng: -99.1,
    dropoff_address: 'Centro',
    dropoff_maps_url: null,
    payment_method: 'cash',
    collect_cents: 20000,
    cash_denomination_cents: 20000,
    package_size: 'normal',
    package_count: 1,
    ready_at: '2026-08-23T00:00:00Z',
    search_at: '2026-08-23T00:00:00Z',
    next_attempt_at: '2026-08-23T00:00:00Z',
    quoted_fee_cents: 4500,
    status: 'delivered',
    assigned_driver_id: 'd1',
    tracking_token: 'tok',
    short_id: 'AB12',
    notes: null,
    cancelled_at: null,
    created_at: '2026-08-23T00:00:00Z',
    updated_at: '2026-08-23T00:00:00Z',
    rider: {
      first_name: 'Luis',
      photo_url: null,
      plate_suffix: '123',
      vehicle_type: 'moto',
      motorcycle_brand: 'Italika',
      motorcycle_color: 'negro',
      latitude: null,
      longitude: null,
      phone: '+525522222222',
    },
    credit_hold_status: 'held',
    credit_hold_cents: 20000,
    ...overrides,
  };
}

test('only held cash credit counts as pending debt', () => {
  assert.equal(hasHeldRiderCredit(request({})), true);
  assert.equal(hasHeldRiderCredit(request({ credit_hold_status: 'released' })), false);
  assert.equal(hasHeldRiderCredit(request({ payment_method: 'transfer' })), false);
  assert.equal(wasRiderCreditReleased(request({ credit_hold_status: 'released' })), true);
});

test('assigned cash can release credit even before hold status arrives', () => {
  assert.equal(
    hasHeldRiderCredit(
      request({
        status: 'assigned',
        credit_hold_status: null,
        credit_hold_cents: 0,
      }),
    ),
    true,
  );
  assert.equal(
    hasHeldRiderCredit(
      request({
        status: 'searching',
        assigned_driver_id: null,
        rider: null,
        credit_hold_status: null,
      }),
    ),
    false,
  );
});

test('groups pending holds by rider and totals the debt', () => {
  const groups = groupHeldRiderCredit([
    request({ id: 'a', short_id: 'AA11', credit_hold_cents: 15000 }),
    request({
      id: 'b',
      short_id: 'BB22',
      assigned_driver_id: 'd2',
      rider: {
        first_name: 'María',
        photo_url: null,
        plate_suffix: '456',
        vehicle_type: 'moto',
        motorcycle_brand: 'Honda',
        motorcycle_color: 'rojo',
        latitude: null,
        longitude: null,
        phone: '+525533333333',
      },
      credit_hold_cents: 8000,
    }),
    request({ id: 'c', short_id: 'CC33', credit_hold_cents: 5000 }),
    request({ id: 'd', credit_hold_status: 'released', credit_hold_cents: 9000 }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.riderName, 'Luis');
  assert.equal(groups[0]?.totalCents, 20000);
  assert.equal(groups[0]?.requests.length, 2);
  assert.equal(groups[1]?.riderName, 'María');
  assert.equal(totalHeldRiderCreditCents(groups), 28000);
});
