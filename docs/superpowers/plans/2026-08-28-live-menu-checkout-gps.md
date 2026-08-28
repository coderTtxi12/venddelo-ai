# Live Menu Checkout GPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En Completar pedido, ofrecer GPS opcional para llenar domicilio y pin cuando el cliente elige delivery.

**Architecture:** Utilidades puras (`browserGeolocation`, `checkoutGpsOffer`) + UI en `CheckoutDeliveryAddressPicker`. Tras un tap, `getCurrentPosition` → reverse geocode → el mismo `onChange` que Places. Sin backend nuevo.

**Tech Stack:** React 19, Next.js, CSS modules, MUI `MyLocationOutlined`, Geolocation API, `reverseGeocodeCoordinates` existente, `node --import tsx --test`.

## Global Constraints

- GPS opcional; el checkout nunca se bloquea por ubicación
- Solo tras gesto de usuario (tap); nunca al montar la pantalla
- Solo en delivery; cero UI en recoger
- Sin GPS si falta Maps API key o no hay geolocation / secure context
- Copy exacta de la spec; iconos MUI, tokens `--dm-*`, sin emojis
- High accuracy, timeout 12s, maximumAge 15s
- Frontend tests: `cd frontend && node --import tsx --test <path>`

---

### Task 1: `browserGeolocation`

**Files:**
- Create: `frontend/src/lib/digital-menu/checkout/browserGeolocation.ts`
- Test: `frontend/src/lib/digital-menu/checkout/browserGeolocation.test.ts`

**Interfaces:**
- Consumes: `Geolocation.getCurrentPosition` (inyectable)
- Produces:
  - `BrowserGeolocationResult = { ok: true; latitude: number; longitude: number } | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' }`
  - `isBrowserGeolocationAvailable(env?: BrowserGeolocationEnv): boolean`
  - `requestBrowserGeolocation(env?: BrowserGeolocationEnv): Promise<BrowserGeolocationResult>`
  - `BROWSER_GEOLOCATION_OPTIONS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }`

- [ ] **Step 1: Write the failing tests**

```ts
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
    geolocation: getCurrentPosition
      ? { getCurrentPosition }
      : null,
  };
}

test('isBrowserGeolocationAvailable is false without secure context', () => {
  assert.equal(
    isBrowserGeolocationAvailable(envWith(() => undefined, false)),
    false,
  );
});

test('isBrowserGeolocationAvailable is false without geolocation', () => {
  assert.equal(isBrowserGeolocationAvailable(envWith(null, true)), false);
});

test('isBrowserGeolocationAvailable is true in secure context with API', () => {
  assert.equal(
    isBrowserGeolocationAvailable(envWith(() => undefined, true)),
    true,
  );
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
    envWith((_success, _error, options) => {
      seen = options;
      _success({
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --import tsx --test src/lib/digital-menu/checkout/browserGeolocation.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --import tsx --test src/lib/digital-menu/checkout/browserGeolocation.test.ts`

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/digital-menu/checkout/browserGeolocation.ts frontend/src/lib/digital-menu/checkout/browserGeolocation.test.ts
git commit -m "feat(live-menu): add injectable browser geolocation helper"
```

---

### Task 2: `checkoutGpsOffer`

**Files:**
- Create: `frontend/src/lib/digital-menu/checkout/checkoutGpsOffer.ts`
- Test: `frontend/src/lib/digital-menu/checkout/checkoutGpsOffer.test.ts`

**Interfaces:**
- Consumes: none (pure)
- Produces:
  - `CheckoutGpsOfferKind = 'card' | 'button' | 'none'`
  - `resolveCheckoutGpsOffer(input: CheckoutGpsOfferInput): CheckoutGpsOfferKind`
  - `CHECKOUT_GPS_COPY` (copy exacta de la spec)
  - `checkoutGpsErrorMessage(reason): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECKOUT_GPS_COPY,
  checkoutGpsErrorMessage,
  resolveCheckoutGpsOffer,
} from './checkoutGpsOffer.ts';

const ready = {
  geolocationAvailable: true,
  mapsApiAvailable: true,
  hasCoordinates: false,
  offerDismissed: false,
};

test('resolveCheckoutGpsOffer shows card when empty and GPS ready', () => {
  assert.equal(resolveCheckoutGpsOffer(ready), 'card');
});

test('resolveCheckoutGpsOffer shows button when coordinates exist', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, hasCoordinates: true }), 'button');
});

test('resolveCheckoutGpsOffer shows button after dismiss', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, offerDismissed: true }), 'button');
});

test('resolveCheckoutGpsOffer hides when geolocation unavailable', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, geolocationAvailable: false }), 'none');
});

test('resolveCheckoutGpsOffer hides when Maps API missing', () => {
  assert.equal(resolveCheckoutGpsOffer({ ...ready, mapsApiAvailable: false }), 'none');
});

test('checkoutGpsErrorMessage maps denied and unavailable', () => {
  assert.equal(checkoutGpsErrorMessage('denied'), CHECKOUT_GPS_COPY.denied);
  assert.equal(checkoutGpsErrorMessage('unavailable'), CHECKOUT_GPS_COPY.unavailable);
  assert.equal(checkoutGpsErrorMessage('unsupported'), null);
});

test('CHECKOUT_GPS_COPY matches spec wording', () => {
  assert.equal(CHECKOUT_GPS_COPY.cardTitle, '¿Usar tu ubicación?');
  assert.equal(
    CHECKOUT_GPS_COPY.cardBody,
    'Llenamos tu domicilio automáticamente. Es opcional; después puedes ajustar el pin.',
  );
  assert.equal(CHECKOUT_GPS_COPY.allow, 'Permitir ubicación');
  assert.equal(CHECKOUT_GPS_COPY.writeInstead, 'Prefiero escribirla');
  assert.equal(CHECKOUT_GPS_COPY.useLocation, 'Usar mi ubicación');
  assert.equal(CHECKOUT_GPS_COPY.requesting, 'Obteniendo tu ubicación…');
  assert.equal(CHECKOUT_GPS_COPY.denied, 'No se usó la ubicación. Busca tu domicilio abajo.');
  assert.equal(
    CHECKOUT_GPS_COPY.unavailable,
    'No encontramos tu GPS. Búscalo o inténtalo de nuevo.',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --import tsx --test src/lib/digital-menu/checkout/checkoutGpsOffer.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
export type CheckoutGpsOfferKind = 'card' | 'button' | 'none';

export type CheckoutGpsOfferInput = {
  geolocationAvailable: boolean;
  mapsApiAvailable: boolean;
  hasCoordinates: boolean;
  offerDismissed: boolean;
};

export const CHECKOUT_GPS_COPY = {
  cardTitle: '¿Usar tu ubicación?',
  cardBody:
    'Llenamos tu domicilio automáticamente. Es opcional; después puedes ajustar el pin.',
  allow: 'Permitir ubicación',
  writeInstead: 'Prefiero escribirla',
  useLocation: 'Usar mi ubicación',
  requesting: 'Obteniendo tu ubicación…',
  denied: 'No se usó la ubicación. Busca tu domicilio abajo.',
  unavailable: 'No encontramos tu GPS. Búscalo o inténtalo de nuevo.',
} as const;

export function resolveCheckoutGpsOffer(input: CheckoutGpsOfferInput): CheckoutGpsOfferKind {
  if (!input.geolocationAvailable || !input.mapsApiAvailable) return 'none';
  if (input.hasCoordinates || input.offerDismissed) return 'button';
  return 'card';
}

export function checkoutGpsErrorMessage(
  reason: 'denied' | 'unavailable' | 'unsupported',
): string | null {
  if (reason === 'denied') return CHECKOUT_GPS_COPY.denied;
  if (reason === 'unavailable') return CHECKOUT_GPS_COPY.unavailable;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --import tsx --test src/lib/digital-menu/checkout/checkoutGpsOffer.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/digital-menu/checkout/checkoutGpsOffer.ts frontend/src/lib/digital-menu/checkout/checkoutGpsOffer.test.ts
git commit -m "feat(live-menu): decide GPS offer card vs compact button"
```

---

### Task 3: GPS UI in `CheckoutDeliveryAddressPicker`

**Files:**
- Modify: `frontend/src/components/digital-menu/CheckoutDeliveryAddressPicker.tsx`
- Modify: `frontend/src/components/digital-menu/CheckoutDeliveryAddressPicker.module.css`

**Interfaces:**
- Consumes: `requestBrowserGeolocation`, `isBrowserGeolocationAvailable`, `resolveCheckoutGpsOffer`, `CHECKOUT_GPS_COPY`, `checkoutGpsErrorMessage`, `reverseGeocodeCoordinates`, `getGoogleMapsApiKey`
- Produces: same `onChange(DeliveryLocationValue)` as Places; no prop API change

**Behavior:**
1. Si `apiKeyMissing`, return temprano sin GPS (fallback textarea intacto).
2. Estado local: `offerDismissed`, `gpsStatus: 'idle' | 'requesting' | 'denied' | 'unavailable'`.
3. `offerKind = resolveCheckoutGpsOffer({ geolocationAvailable, mapsApiAvailable: true, hasCoordinates: hasCoords, offerDismissed })`.
4. Tap Permitir / Usar mi ubicación → `requesting` → `requestBrowserGeolocation()`.
   - ok → emitir coords de inmediato, reverse geocode, actualizar address; `offerDismissed = true`.
   - fail denied/unavailable → mensaje; `offerDismissed = true` (pasa a botón compacto).
5. Tap Prefiero escribirla → `offerDismissed = true`.
6. Buscador siempre visible debajo.

- [ ] **Step 1: Add GPS handlers and offer UI above the search field**

Insert after the `apiKeyMissing` early return, before `<label>Busca tu domicilio</label>`:

Offer card when `offerKind === 'card'`. Compact button in a row above search when `offerKind === 'button'`. Status/error with `aria-live="polite"`.

Apply GPS:

```ts
const applyGpsCoordinates = useCallback(async (latitude: number, longitude: number) => {
  shouldScrollToMapRef.current = true;
  onChangeRef.current({
    ...valueRef.current,
    latitude,
    longitude,
    placeId: null,
  });
  setGeocoding(true);
  try {
    const address = await reverseGeocodeCoordinates(latitude, longitude);
    onChangeRef.current({
      ...valueRef.current,
      address: address ?? valueRef.current.address,
      latitude,
      longitude,
      placeId: null,
    });
  } finally {
    setGeocoding(false);
  }
}, []);

const handleUseLocation = useCallback(async () => {
  setGpsStatus('requesting');
  const result = await requestBrowserGeolocation();
  setOfferDismissed(true);
  if (!result.ok) {
    setGpsStatus(result.reason === 'denied' ? 'denied' : 'unavailable');
    return;
  }
  setGpsStatus('idle');
  await applyGpsCoordinates(result.latitude, result.longitude);
}, [applyGpsCoordinates]);
```

Primary button (card): `CHECKOUT_GPS_COPY.allow`. Compact: icon + `CHECKOUT_GPS_COPY.useLocation`. Both `type="button"`, `cursor-pointer`, `disabled={gpsStatus === 'requesting'}`, `aria-busy` when requesting.

When requesting, also set overlay-friendly copy via a live region using `CHECKOUT_GPS_COPY.requesting`.

- [ ] **Step 2: CSS for card, compact button, live status**

Use `--dm-*` tokens. Card similar to `.precisionNote`. Compact button 44px min-height, full width on mobile. `prefers-reduced-motion`. Focus-visible rings.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/digital-menu/CheckoutDeliveryAddressPicker.tsx frontend/src/components/digital-menu/CheckoutDeliveryAddressPicker.module.css
git commit -m "feat(live-menu): offer optional GPS to fill delivery address"
```

---

### Task 4: Verify

- [ ] Run `cd frontend && node --import tsx --test src/lib/digital-menu/checkout/browserGeolocation.test.ts src/lib/digital-menu/checkout/checkoutGpsOffer.test.ts`
- [ ] Manual HTTPS: delivery sin dirección → tarjeta → permitir → pin; denegar → buscar a mano; dirección guardada → botón compacto; recoger → sin GPS.

---

## Spec coverage

| Spec | Task |
|------|------|
| Tarjeta si vacío | 2 + 3 |
| Botón si coords o dismiss | 2 + 3 |
| Tap requerido, no auto GPS | 3 |
| Reverse geocode + mapa | 3 |
| denied / unavailable copy | 2 + 3 |
| Sin GPS sin Maps key | 3 (early return) |
| Recoger sin GPS | 3 (picker only mounts on delivery) |
| Unit tests geolocation + offer | 1 + 2 |
