# Kitchen Orders Fast Load — Fase 3 (Design Spec)

**Date:** 2026-07-20  
**Status:** Approved for implementation  
**Scope:** Cache en memoria (stale-while-revalidate) y prefetch desde sidebar

---

## 1. Problem (post Fase 2)

Al navegar entre secciones del panel y volver a `/orders`, o al hacer clic en Órdenes desde otra página, siempre hay que esperar el fetch aunque los datos eran recientes.

---

## 2. Goals

| Goal | Success criteria |
|------|------------------|
| Stale-while-revalidate | Volver a `/orders` muestra datos cacheados al instante si TTL ≤ 60s |
| Prefetch sidebar | Hover/focus en nav "Órdenes" precarga filtro default + summary |
| Coherencia | Cache se invalida al cambiar restaurante o recibir eventos WebSocket / mutaciones |
| Sin regresión Fase 2 | Filtros server-side, scroll infinito e summary intactos |

---

## 3. Non-goals

- Endpoint dedicado `GET /orders/kitchen` (no necesario con cache client-side)
- Persistencia en localStorage/IndexedDB
- Prefetch de todos los filtros

---

## 4. Architecture

### 4.1 `kitchenOrdersCache.ts`

- Map en memoria: clave `restaurantId:filter`
- Valor: `{ orders, nextCursor, hasMore, summary, fetchedAt }`
- TTL: **60 segundos**
- API: `get`, `set`, `invalidateRestaurant`, `prefetchKitchenOrders`

### 4.2 `RestaurantOrdersContext`

- Al cargar: si cache válido → hidratar estado, `loading=false`, refresh silencioso en background
- Tras fetch exitoso → escribir cache
- WebSocket / `replaceOrder` / cambio restaurante → invalidar cache del restaurante

### 4.3 `Sidebar`

- `onMouseEnter` + `onFocus` en link `/orders` → `prefetchKitchenOrders` (si no estás ya en `/orders`)

---

## 5. Testing

- `kitchenOrdersCache.test.ts`: TTL, invalidate, prefetch dedupe
