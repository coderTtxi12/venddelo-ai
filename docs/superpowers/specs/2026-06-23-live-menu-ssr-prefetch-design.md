# Live Menu SSR Prefetch — Design Spec

> Status: **Implemented**

## Goal

Prefetch `restaurant` + `menu` en el Server Component de `/menu/[subdomain]` y pasarlos al cliente para primer paint sin spinner ni waterfall JS→fetch.

## Approach

- `fetchPublicMenuCriticalData(subdomain)` con `react.cache()` para deduplicar metadata + page.
- `fetch` con `cache: 'no-store'` (menú público debe estar actualizado).
- `PublicDigitalMenuPage` acepta `initialRestaurant` + `initialMenu`; si existen, `loading=false` y solo carga secundaria (schedules/promos) en cliente.
- Si el prefetch en servidor falla, el cliente hace el flujo actual (fallback).

## Non-goals

- SSR de promociones/horarios (siguen en background en cliente).
- Static generation / ISR.

## Files

- `frontend/src/lib/api/client.ts` — opciones `cache`/`next` en fetch
- `frontend/src/lib/api/public.ts` — pasar `RequestOptions` opcional
- `frontend/src/lib/api/publicMenuServer.ts` — fetch servidor con cache dedupe
- `frontend/src/app/menu/[subdomain]/page.tsx` — prefetch + metadata
- `frontend/src/components/pages/PublicDigitalMenuPage.tsx` — props iniciales
