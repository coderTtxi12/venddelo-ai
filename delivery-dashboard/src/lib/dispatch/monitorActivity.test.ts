import assert from 'node:assert/strict';
import test from 'node:test';

import { monitorActivityState } from './monitorActivity.ts';

test('disables monitor network activity while the kept-alive page is hidden', () => {
  assert.deepEqual(
    monitorActivityState({
      active: false,
      accessToken: 'token',
      zonesLoading: false,
      connectionStatus: 'offline',
    }),
    {
      shouldLoadSnapshot: false,
      socketToken: null,
      shouldPollFallback: false,
    },
  );
});

test('enables monitor socket and fallback poll only when visible and not live', () => {
  assert.deepEqual(
    monitorActivityState({
      active: true,
      accessToken: 'token',
      zonesLoading: false,
      connectionStatus: 'offline',
    }),
    {
      shouldLoadSnapshot: true,
      socketToken: 'token',
      shouldPollFallback: true,
    },
  );

  assert.equal(
    monitorActivityState({
      active: true,
      accessToken: 'token',
      zonesLoading: false,
      connectionStatus: 'live',
    }).shouldPollFallback,
    false,
  );
});
