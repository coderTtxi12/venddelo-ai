export type BrowserGeolocationFailureReason =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'services_off';

export type BrowserGeolocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: BrowserGeolocationFailureReason };

export type BrowserGeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type BrowserGeolocationEnv = {
  isSecureContext: boolean;
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null;
  permissions?: {
    query: (descriptor: { name: 'geolocation' }) => Promise<{ state: string }>;
  } | null;
};

export const BROWSER_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
};

export function defaultBrowserGeolocationEnv(): BrowserGeolocationEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isSecureContext: false, geolocation: null, permissions: null };
  }
  return {
    isSecureContext: Boolean(window.isSecureContext),
    geolocation: navigator.geolocation ?? null,
    permissions: navigator.permissions ?? null,
  };
}

export function isBrowserGeolocationAvailable(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): boolean {
  return Boolean(env.isSecureContext && env.geolocation?.getCurrentPosition);
}

export async function queryGeolocationPermission(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): Promise<BrowserGeolocationPermissionState> {
  if (!env.permissions?.query) return 'unknown';
  try {
    const status = await env.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function reasonFromGeolocationError(
  error: { code?: number } | null | undefined,
  permission: BrowserGeolocationPermissionState,
): BrowserGeolocationFailureReason {
  if (error?.code === 1) return 'denied';
  if (error?.code === 2 && permission !== 'granted' && permission !== 'denied') {
    return 'services_off';
  }
  return 'unavailable';
}

export async function requestBrowserGeolocation(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): Promise<BrowserGeolocationResult> {
  if (!isBrowserGeolocationAvailable(env) || !env.geolocation) {
    return { ok: false, reason: 'unsupported' };
  }

  const positionResult = await new Promise<BrowserGeolocationResult>((resolve) => {
    env.geolocation!.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      async (error) => {
        const permission = await queryGeolocationPermission(env);
        resolve({ ok: false, reason: reasonFromGeolocationError(error, permission) });
      },
      BROWSER_GEOLOCATION_OPTIONS,
    );
  });

  return positionResult;
}
