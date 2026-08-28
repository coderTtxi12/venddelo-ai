import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_GEOLOCATION_OPTIONS,
  isBrowserGeolocationAvailable,
  requestBrowserGeolocation,
  type BrowserGeolocationEnv,
} from './browserGeolocation.ts';

function envWith(
  getCurrentPosition: Geolocation['getCurrentPosition'] | null,
  isSecureContext = true,
  permissionState?: 'granted' | 'denied' | 'prompt',
): BrowserGeolocationEnv {
  return {
    isSecureContext,
    geolocation: getCurrentPosition ? { getCurrentPosition } : null,
    permissions: permissionState
      ? { query: async () => ({ state: permissionState, onchange: null }) }
      : null,
  };
}

test('isBrowserGeolocationAvailable is false without secure context', () => {
  assert.equal(isBrowserGeolocationAvailable(envWith(() => undefined, false)), false);
});

test('isBrowserGeolocationAvailable is false without geolocation', () => {
  assert.equal(isBrowserGeolocationAvailable(envWith(null, true)), false);
});

test('isBrowserGeolocationAvailable is true in secure context with API', () => {
  assert.equal(isBrowserGeolocationAvailable(envWith(() => undefined, true)), true);
});

test('requestBrowserGeolocation returns unsupported when unavailable', async () => {
  const result = await requestBrowserGeolocation(envWith(null, true));
  assert.deepEqual(result, { ok: false, reason: 'unsupported' });
});

test('requestBrowserGeolocation returns coordinates on success', async () => {
  const result = await requestBrowserGeolocation(
    envWith((success) => {
      success({
        coords: { latitude: 19.43, longitude: -99.13 },
      } as GeolocationPosition);
    }),
  );
  assert.deepEqual(result, { ok: true, latitude: 19.43, longitude: -99.13 });
});

test('requestBrowserGeolocation maps PERMISSION_DENIED', async () => {
  const result = await requestBrowserGeolocation(
    envWith((_success, error) => {
      error?.({ code: 1 } as GeolocationPositionError);
    }),
  );
  assert.deepEqual(result, { ok: false, reason: 'denied' });
});

test('requestBrowserGeolocation maps timeout as unavailable', async () => {
  const timeout = await requestBrowserGeolocation(
    envWith((_success, error) => {
      error?.({ code: 3 } as GeolocationPositionError);
    }),
  );
  assert.deepEqual(timeout, { ok: false, reason: 'unavailable' });
});

test('POSITION_UNAVAILABLE without prior permission is services_off', async () => {
  const result = await requestBrowserGeolocation(
    envWith(
      (_success, error) => {
        error?.({ code: 2 } as GeolocationPositionError);
      },
      true,
      'prompt',
    ),
  );
  assert.deepEqual(result, { ok: false, reason: 'services_off' });
});

test('POSITION_UNAVAILABLE after permission granted stays unavailable', async () => {
  const result = await requestBrowserGeolocation(
    envWith(
      (_success, error) => {
        error?.({ code: 2 } as GeolocationPositionError);
      },
      true,
      'granted',
    ),
  );
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});

test('retries getCurrentPosition once after permission is granted so GPS-off can show the system dialog', async () => {
  let calls = 0;
  let permissionState: 'prompt' | 'granted' = 'prompt';
  const result = await requestBrowserGeolocation({
    isSecureContext: true,
    geolocation: {
      getCurrentPosition(_success, error) {
        calls += 1;
        permissionState = 'granted';
        error?.({ code: 2 } as GeolocationPositionError);
      },
    },
    permissions: {
      query: async () => ({ state: permissionState, onchange: null }),
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});

test('starts a second location request when permission changes to granted while the first hangs', async () => {
  let calls = 0;
  let permissionState: 'prompt' | 'granted' = 'prompt';
  const status = {
    get state() {
      return permissionState;
    },
    onchange: null as (() => void) | null,
  };

  const result = await requestBrowserGeolocation({
    isSecureContext: true,
    geolocation: {
      getCurrentPosition(_success, error) {
        calls += 1;
        if (calls === 1) {
          permissionState = 'granted';
          queueMicrotask(() => status.onchange?.());
          return;
        }
        error?.({ code: 2 } as GeolocationPositionError);
      },
    },
    permissions: {
      query: async () => status,
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});

test('requestBrowserGeolocation does not timeout native location dialogs', async () => {
  let seen: PositionOptions | undefined;
  await requestBrowserGeolocation(
    envWith((success, _error, options) => {
      seen = options;
      success({
        coords: { latitude: 1, longitude: 2 },
      } as GeolocationPosition);
    }),
  );
  assert.equal(seen?.enableHighAccuracy, true);
  assert.equal(seen?.maximumAge, 15_000);
  assert.equal(seen?.timeout, undefined);
  assert.equal(BROWSER_GEOLOCATION_OPTIONS.timeout, undefined);
});
