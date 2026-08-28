export type BrowserGeolocationFailureReason = 'unsupported' | 'denied' | 'unavailable';

export type BrowserGeolocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: BrowserGeolocationFailureReason };

export type BrowserGeolocationEnv = {
  isSecureContext: boolean;
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null;
};

export const BROWSER_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 15_000,
};

export function defaultBrowserGeolocationEnv(): BrowserGeolocationEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isSecureContext: false, geolocation: null };
  }
  return {
    isSecureContext: Boolean(window.isSecureContext),
    geolocation: navigator.geolocation ?? null,
  };
}

export function isBrowserGeolocationAvailable(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): boolean {
  return Boolean(env.isSecureContext && env.geolocation?.getCurrentPosition);
}

function reasonFromGeolocationError(
  error: { code?: number } | null | undefined,
): BrowserGeolocationFailureReason {
  if (error?.code === 1) return 'denied';
  return 'unavailable';
}

export function requestBrowserGeolocation(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): Promise<BrowserGeolocationResult> {
  if (!isBrowserGeolocationAvailable(env) || !env.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    env.geolocation!.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        resolve({ ok: false, reason: reasonFromGeolocationError(error) });
      },
      BROWSER_GEOLOCATION_OPTIONS,
    );
  });
}
