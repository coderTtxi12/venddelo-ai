import assert from 'node:assert/strict';
import test from 'node:test';

import type { DispatchRequest } from '../api/dispatch.ts';
import { groupHeldTerminals, hasHeldTerminal } from './riderTerminalHold.ts';

function request(overrides: Partial<DispatchRequest>): DispatchRequest {
  return {
    id: 'r1',
    customer_name: 'Ana',
    customer_phone: '+525511111111',
    dropoff_lat: 19.4,
    dropoff_lng: -99.1,
    dropoff_address: 'Centro',
    dropoff_maps_url: null,
    payment_method: 'card_terminal',
    collect_cents: 20000,
    cash_denomination_cents: null,
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
    credit_hold_status: null,
    credit_hold_cents: 0,
    terminal_hold_status: null,
    terminal_holder: null,
    ...overrides,
  };
}

test('groups held terminals by holder not assigned rider', () => {
  const rows = [
    request({
      id: 'a',
      terminal_hold_status: 'held',
      terminal_holder: { driver_id: 'r1', first_name: 'Ana', photo_url: null },
      assigned_driver_id: 'r2',
      status: 'assigned',
    }),
    request({
      id: 'b',
      terminal_hold_status: 'released',
      terminal_holder: { driver_id: 'r1', first_name: 'Ana', photo_url: null },
    }),
  ];
  assert.equal(hasHeldTerminal(rows[0]), true);
  assert.equal(hasHeldTerminal(rows[1]), false);
  const groups = groupHeldTerminals(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.riderName, 'Ana');
  assert.deepEqual(
    groups[0]?.requests.map((row) => row.id),
    ['a'],
  );
});
