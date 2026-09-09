import assert from 'node:assert/strict';
import test from 'node:test';

import type { DispatchCreateInput } from '../api/dispatch.ts';
import {
  dispatchAttemptFingerprint,
  resolveDispatchIdempotency,
} from './dispatchIdempotency.ts';

const input: DispatchCreateInput = {
  customer_name: 'María',
  customer_phone: '+525512345678',
  dropoff_lat: 19.4,
  dropoff_lng: -99.1,
  dropoff_address: 'Centro',
  dropoff_maps_url: null,
  payment_method: 'cash',
  collect_cents: 25000,
  cash_denomination_cents: 50000,
  package_size: 'normal',
  package_count: 1,
  prep_minutes: 5,
  notes: null,
};

test('resolveDispatchIdempotency reuses the key for the same payload', () => {
  const fingerprint = dispatchAttemptFingerprint('rest-1', input);
  const first = resolveDispatchIdempotency(fingerprint, null);
  const second = resolveDispatchIdempotency(fingerprint, first);

  assert.equal(second.key, first.key);
  assert.equal(second.fingerprint, fingerprint);
});

test('resolveDispatchIdempotency issues a new key when the payload changes', () => {
  const first = resolveDispatchIdempotency(
    dispatchAttemptFingerprint('rest-1', input),
    null,
  );
  const second = resolveDispatchIdempotency(
    dispatchAttemptFingerprint('rest-1', { ...input, customer_name: 'Otra' }),
    first,
  );

  assert.notEqual(second.key, first.key);
});
