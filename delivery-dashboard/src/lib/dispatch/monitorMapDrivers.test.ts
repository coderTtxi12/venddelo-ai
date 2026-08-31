import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowDriverOnMonitorMap } from './monitorMapDrivers';

test('shows online drivers even without an active order', () => {
  assert.equal(
    shouldShowDriverOnMonitorMap({
      is_online: true,
      active_request_id: null,
      occupied_job_count: 0,
    }),
    true,
  );
});

test('hides offline drivers with no active work', () => {
  assert.equal(
    shouldShowDriverOnMonitorMap({
      is_online: false,
      active_request_id: null,
      occupied_job_count: 0,
    }),
    false,
  );
});

test('shows a focused driver even if they are offline and idle', () => {
  assert.equal(
    shouldShowDriverOnMonitorMap(
      {
        is_online: false,
        active_request_id: null,
        occupied_job_count: 0,
      },
      true,
    ),
    true,
  );
});

test('shows offline drivers with an active request', () => {
  assert.equal(
    shouldShowDriverOnMonitorMap({
      is_online: false,
      active_request_id: 'req-1',
      occupied_job_count: 0,
    }),
    true,
  );
});

test('shows offline drivers with occupied jobs', () => {
  assert.equal(
    shouldShowDriverOnMonitorMap({
      is_online: false,
      active_request_id: null,
      occupied_job_count: 2,
    }),
    true,
  );
});
