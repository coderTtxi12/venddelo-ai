# Kitchen Orders Fast Load — Fase 1 (Design Spec)

**Date:** 2026-07-20  
**Status:** Approved for implementation  
**Scope:** Reducir tiempo de carga inicial de `/orders` sin cambiar flujo de cocina ni WebSocket

---

## 1. Problem

La vista de cocina (`/orders`) tarda varios segundos en mostrar contenido porque:

1. Descarga **todo** el historial de pedidos (`fetchAllPages`, paginación secuencial).
2. Bloquea la UI hasta cargar **todo el catálogo** de productos y **todas** las promociones.
3. El backend hace **N+1 queries** al serializar items de cada pedido.
4. Hay **bootstrap duplicado** de restaurante (`RestaurantGate` + `RestaurantAccessContext`).

La auth (Supabase) no es el cuello de botella.

---

## 2. Goals (Fase 1)

| Goal | Success criteria |
|------|------------------|
| Time to first pedidos visibles | Lista visible tras **1 request** de pedidos (≤50 ítems), sin esperar catálogo |
| Menos requests al entrar | De 5–15+ a **2–3** (acceso restaurante + pedidos página 1) |
| Backend eficiente | Listado de pedidos con items en **≤3 queries** por página (sin N+1) |
| Sin regresión cocina | WebSocket, cambio de status, WhatsApp, snapshots de descuento/imagen intactos |
| Sin regresión onboarding | Usuarios sin restaurante siguen yendo a `/onboarding` |

---

## 3. Non-goals (Fase 1)

- Endpoint dedicado `GET /orders/kitchen` (Fase 2/3)
- Filtro API por status/vista activa vs archivo (Fase 2)
- Paginación infinita en UI para historial completo (Fase 2)
- Cache persistente / prefetch en sidebar (Fase 3)

---

## 4. Architecture

### 4.1 Frontend — carga de pedidos

**Antes:** `fetchAllPages(listRestaurantOrders, 100)` → N requests secuenciales, bloquea hasta terminar.

**Después:**
- Carga inicial: `listRestaurantOrders(token, rid, 50)` — **una sola página**.
- Estado: `orders`, `ordersHasMore`, `ordersNextCursor`, `loadMoreOrders()`.
- `refreshOrders()` recarga solo la primera página.
- WebSocket sigue siendo fuente de verdad para pedidos nuevos/actualizados.

**Limitación aceptada en Fase 1:** pedidos antiguos fuera de la primera página no aparecen hasta Fase 2 (`load more` / filtro API). El filtro default es **Nuevos** (`pending`); 50 pedidos recientes cubren el caso típico de cocina.

### 4.2 Frontend — productos y promociones

**Antes:** `fetchAllPages(listProducts)` + `listAllPromotions()` bloquean render (`loading || productsLoading`).

**Después:**
- La lista y detalle básico renderizan con datos ya en `order_items` (`product_name`, `product_image_path`, `applied_discounts`).
- Al **seleccionar un pedido**, lazy-fetch de productos faltantes vía `getProduct()` (solo IDs del pedido, en paralelo).
- No se cargan promociones globalmente; `resolveOrderItemDiscounts` usa snapshots en `applied_discounts`.
- Opciones: fallback a IDs sin producto; con `getProduct` se resuelven labels de option groups.

### 4.3 Frontend — bootstrap de restaurante

**Antes:** `RestaurantGate` llama `resolveSupplierIdByEmail` → `getMyRestaurant`; luego `RestaurantAccessContext` llama `listMyRestaurantAccess` + `getMyRestaurant` otra vez.

**Después:**
- `RestaurantAccessProvider` envuelve `RestaurantGate` en `(panel)/layout.tsx`.
- `RestaurantGate` usa `useRestaurantAccess()`: loading → spinner; sin restaurante → `/onboarding`.
- Se elimina la llamada API duplicada en `RestaurantGate`.
- `MainLayout` ya no incluye `RestaurantAccessProvider` (una sola instancia).

### 4.4 Backend — eager load de items

En `SqlAlchemyOrderRepository.list_by_restaurant` y `get`:

```python
select(Order).options(selectinload(Order.items))
```

Test de query count acotado (patrón `test_get_full_menu_bounded_query_count`).

---

## 5. Files to change

| File | Change |
|------|--------|
| `backend/app/modules/orders/adapters.py` | `selectinload(Order.items)` |
| `backend/tests/modules/test_orders_repo.py` | Test query count + items en listado |
| `frontend/src/app/(panel)/layout.tsx` | Mover `RestaurantAccessProvider` aquí |
| `frontend/src/layouts/MainLayout.tsx` | Quitar `RestaurantAccessProvider` |
| `frontend/src/components/onboarding/RestaurantGate.tsx` | Usar `useRestaurantAccess`, sin `resolveSupplierIdByEmail` |
| `frontend/src/contexts/RestaurantOrdersContext.tsx` | Primera página, quitar `getRestaurant`, paginación opcional |
| `frontend/src/components/orders/KitchenOrdersView.tsx` | Quitar bloqueo por productos; lazy `getProduct` |
| `frontend/src/lib/orders/useKitchenOrderProducts.ts` | **Nuevo** hook lazy-fetch productos del pedido seleccionado |

---

## 6. Error handling

- Fallo en primera página de pedidos: mensaje existente en `loadError`.
- Fallo en lazy product fetch: log + fallback (nombres en snapshot, option IDs crudos).
- Sin restaurante tras access load: redirect onboarding (comportamiento actual).

---

## 7. Testing

| Layer | Test |
|-------|------|
| Backend | `test_list_by_restaurant_eager_loads_items_bounded_queries` |
| Backend | Existing pagination tests siguen pasando |
| Manual | `/orders` muestra lista en <1s con backend local; detalle de pedido con opciones tras selección |

---

## 8. Rollout

Deploy backend + frontend juntos. Sin migración DB. Sin feature flag.
