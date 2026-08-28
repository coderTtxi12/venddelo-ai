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
): BrowserGeolocationEnv {
  return {
    isSecureContext,
    geolocation: getCurrentPosition ? { getCurrentPosition } : null,
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

test('requestBrowserGeolocation maps timeout and unavailable', async () => {
  const timeout = await requestBrowserGeolocation(
    envWith((_success, error) => {
      error?.({ code: 3 } as GeolocationPositionError);
    }),
  );
  assert.deepEqual(timeout, { ok: false, reason: 'unavailable' });
});

test('requestBrowserGeolocation uses high accuracy 12s timeout', async () => {
  let seen: PositionOptions | undefined;
  await requestBrowserGeolocation(
    envWith((success, _error, options) => {
      seen = options;
      success({
        coords: { latitude: 1, longitude: 2 },
      } as GeolocationPosition);
    }),
  );
  assert.deepEqual(seen, {
    enableHighAccuracy: true,
    timeout: 12_000,
    maximumAge: 15_000,
  });
  assert.equal(BROWSER_GEOLOCATION_OPTIONS.timeout, 12_000);
});
