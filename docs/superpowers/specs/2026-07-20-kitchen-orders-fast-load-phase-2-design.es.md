# Kitchen Orders Fast Load — Fase 2 (Design Spec)

**Date:** 2026-07-20  
**Status:** Approved for implementation  
**Scope:** Filtros server-side, contadores precisos y paginación infinita en `/orders`

---

## 1. Problem (post Fase 1)

Fase 1 cargó solo la primera página sin catálogo completo, pero:

1. Los filtros de cocina (**Nuevos, Activos, Entregados**, etc.) filtran **en cliente** sobre ~50 pedidos recientes.
2. Los contadores de chips y el badge del sidebar se calculan del array cargado, no del total real.
3. Historial archivado incompleto; solo botón manual "Cargar más".

---

## 2. Goals

| Goal | Success criteria |
|------|------------------|
| Filtro server-side | Cada chip dispara listado con `status` o `view` en API |
| Contadores precisos | `GET /orders/summary` alimenta chips y badge sidebar |
| Paginación infinita | Scroll en lista carga más páginas del filtro activo |
| WebSocket coherente | Eventos añaden/quitan pedidos según filtro activo; summary se actualiza |
| Sin regresión Fase 1 | Entrada sigue siendo 1 request de pedidos + 1 de summary |

---

## 3. API

### 3.1 `GET /restaurants/{id}/orders/summary`

```json
{
  "pending": 3,
  "confirmed": 1,
  "preparing": 0,
  "ready": 2,
  "delivered": 120,
  "cancelled": 4,
  "active": 6,
  "total": 130
}
```

### 3.2 `GET /restaurants/{id}/orders` — query extendido

| Param | Valores | Efecto |
|-------|---------|--------|
| `status` | `pending`, `confirmed`, … | Un solo status (existente) |
| `view` | `active`, `archive` | `active` = pipeline; `archive` = entregados+cancelados |

`status` y `view` son **mutuamente excluyentes** (422 si ambos).

Mapeo frontend:

| Filtro UI | Query |
|-----------|-------|
| `new` | `status=pending` |
| `confirmed` / `preparing` / `ready` / `delivered` / `cancelled` | `status=X` |
| `active` | `view=active` |
| `all` | (sin filtro) |

---

## 4. Frontend

- `RestaurantOrdersContext` guarda `kitchenFilter`, recarga al cambiar filtro.
- Summary en contexto; `pendingOrdersCount = summary.pending`.
- `applyKitchenOrderSocketEvent(order, filter)` — quita pedidos que ya no calzan.
- `useKitchenOrdersInfiniteScroll` — IntersectionObserver en lista.
- `buildFilterCountsFromSummary()` reemplaza conteo client-side.

---

## 5. Non-goals

- Endpoint dedicado `/orders/kitchen` (Fase 3)
- Cache persistente / prefetch sidebar (Fase 3)

---

## 6. Testing

- Backend: summary counts, list con `view=active|archive`, mutual exclusion status+view
- Frontend: `orderFilterToApiParams`, `buildFilterCountsFromSummary`
