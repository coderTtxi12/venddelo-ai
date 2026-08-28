export type BrowserGeolocationFailureReason =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'services_off';

export type BrowserGeolocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: BrowserGeolocationFailureReason };

export type BrowserGeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type BrowserGeolocationPermissionStatus = {
  state: string;
  onchange: ((this: unknown, ev?: Event) => void) | null;
};

export type BrowserGeolocationEnv = {
  isSecureContext: boolean;
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null;
  permissions?: {
    query: (descriptor: { name: 'geolocation' }) => Promise<BrowserGeolocationPermissionStatus>;
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
    permissions: navigator.permissions
      ? {
          query: (descriptor) =>
            navigator.permissions.query(descriptor) as Promise<BrowserGeolocationPermissionStatus>,
        }
      : null,
  };
}

export function isBrowserGeolocationAvailable(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): boolean {
  return Boolean(env.isSecureContext && env.geolocation?.getCurrentPosition);
}

function parsePermissionState(state: string): BrowserGeolocationPermissionState {
  if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
  return 'unknown';
}

export async function queryGeolocationPermission(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): Promise<BrowserGeolocationPermissionState> {
  if (!env.permissions?.query) return 'unknown';
  try {
    const status = await env.permissions.query({ name: 'geolocation' });
    return parsePermissionState(status.state);
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

function readPosition(
  position: GeolocationPosition,
): Extract<BrowserGeolocationResult, { ok: true }> {
  return {
    ok: true,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export async function requestBrowserGeolocation(
  env: BrowserGeolocationEnv = defaultBrowserGeolocationEnv(),
): Promise<BrowserGeolocationResult> {
  if (!isBrowserGeolocationAvailable(env) || !env.geolocation) {
    return { ok: false, reason: 'unsupported' };
  }

  const permissionStatus = env.permissions?.query
    ? await env.permissions.query({ name: 'geolocation' }).catch(() => null)
    : null;
  const permissionBefore = permissionStatus
    ? parsePermissionState(permissionStatus.state)
    : 'unknown';

  return new Promise((resolve) => {
    let settled = false;
    let requestId = 0;
    let retriedAfterGrant = false;

    const finish = (result: BrowserGeolocationResult) => {
      if (settled) return;
      settled = true;
      if (permissionStatus) permissionStatus.onchange = null;
      resolve(result);
    };

    const startRequest = () => {
      const thisRequest = ++requestId;
      env.geolocation!.getCurrentPosition(
        (position) => {
          finish(readPosition(position));
        },
        (error) => {
          void (async () => {
            if (settled || thisRequest !== requestId) return;
            if (error?.code === 1) {
              finish({ ok: false, reason: 'denied' });
              return;
            }
            const permission = await queryGeolocationPermission(env);
            if (settled || thisRequest !== requestId) return;
            if (permission === 'granted' && permissionBefore !== 'granted' && !retriedAfterGrant) {
              retriedAfterGrant = true;
              startRequest();
              return;
            }
            finish({ ok: false, reason: reasonFromGeolocationError(error, permission) });
          })();
        },
        BROWSER_GEOLOCATION_OPTIONS,
      );
    };

    if (permissionStatus && permissionBefore === 'prompt') {
      permissionStatus.onchange = () => {
        if (settled || retriedAfterGrant) return;
        if (parsePermissionState(permissionStatus.state) !== 'granted') return;
        retriedAfterGrant = true;
        startRequest();
      };
    }

    startRequest();
  });
}
