# Borrado masivo de productos (dashboard restaurant)

Fecha: 2026-07-30  
Alcance: backend menu API + dashboard `frontend/` en `/products`  
Relacionado:

- `docs/superpowers/specs/2026-07-30-hard-delete-products-categories-design.es.md`
- `docs/superpowers/specs/2026-07-29-dashboard-delete-products-categories-design.es.md`

## Problema

En `/products` el dueño solo puede eliminar de a uno. Para limpiar catálogos grandes hace falta seleccionar varios productos y borrarlos en una sola acción, con la misma semántica permanente e irreversible que el botón Eliminar actual (`DELETE .../products/{id}/permanent`).

## Decisiones

| Decisión | Elección |
|----------|----------|
| Semántica | Hard-delete permanente (igual que Eliminar individual) |
| API | Endpoint bulk dedicado (no loop de N DELETEs) |
| Atomicidad | Todo-o-nada: si un ID falla, no se borra ninguno |
| Seleccionar todos | Solo la página actual |
| Soft-delete / `/permanent` unitario | Sin cambios |
| Categorías / otras acciones bulk | Fuera de alcance |
| Storage / imágenes | Fuera de alcance |
| Assistant / delivery-dashboard | Fuera de alcance |

## API

Owner-only (`require_owned_restaurant`), igual que el resto del menú.

```http
POST /api/v1/restaurants/{restaurant_id}/products/permanent-bulk
Content-Type: application/json

{ "product_ids": ["uuid", "..."] }
→ 204 No Content
```

### Reglas

| Caso | Comportamiento |
|------|----------------|
| IDs válidos del restaurant | Hard-delete de todos en una transacción; una invalidación de cache de menú |
| Algún ID inexistente / otro restaurant | `404`; **ninguno** se borra |
| Lista vacía | `400` |
| Duplicados en el body | Se deduplican antes de borrar |
| Límite | Máx. 20 (= `PRODUCTS_PAGE_SIZE` del dashboard; select-all = página actual) |
| Sin auth / no owner | Igual que el resto del menú |

Los endpoints existentes no cambian:

```http
DELETE .../products/{product_id}              # soft / draft
DELETE .../products/{product_id}/permanent    # hard unitario
```

### Comportamiento en DB

Misma semántica que hard-delete unitario por cada producto del lote:

- CASCADE: `product_categories`, option groups/items, vínculos de promociones a producto
- Órdenes: `order_items.product_id` → `NULL`; snapshot de línea intacto

### Capas backend

| Capa | Cambio |
|------|--------|
| Schemas | Request body `product_ids: list[UUID]` (min 1, max 20) |
| `MenuRepository` / adapters | `hard_delete_products(ids)` — valida ownership/existencia de **todos** antes de borrar; o borra en loop dentro de la misma sesión/transacción tras validar el set completo |
| `MenuService` | `permanently_delete_products(restaurant_id, ids)` |
| `menu/api.py` | `POST .../products/permanent-bulk` → 204 |

## Frontend / UI

Patrón UX (ui-ux-pro-max): **columna checkbox + action bar**. Visual alineado al tema del dashboard (variables CSS existentes: `--color-primary`, `--color-surface`, `--color-border`, `dangerGhostBtn`). Sin paleta nueva.

### Selección

- Checkbox a la izquierda de cada fila de producto
- Header: seleccionar / deseleccionar todos los de **la página actual** (estado indeterminate si parcial)
- Click en checkbox no abre el editor (`stopPropagation`)
- Fila seleccionada: fondo sutil con `color-mix` del primary
- Al cambiar página, filtros o tab: limpiar selección
- Estado: `Set` de product IDs en `ProductsPage`

### Action bar (`selectedCount > 0`)

- Bajo el toolbar de búsqueda: `N seleccionados` · `Deseleccionar` · `Eliminar`
- ConfirmDialog vía extensión de `buildDeleteConfirmCopy` para N productos (copy irreversible)
- Durante `deleteLoading`: deshabilitar Eliminar individual, bulk y checkboxes

### Responsive

| Breakpoint | Comportamiento |
|------------|----------------|
| Desktop (≥1024) | Checkbox en columna; action bar en una fila |
| Tablet (~768) | Igual; touch targets ≥44px; tabla con overflow-x si hace falta |
| Móvil (≤640) | Action bar sticky inferior o full-width: contador + Eliminar a ancho completo; checkboxes grandes |

### A11y

- `aria-label` por checkbox; header con indeterminate
- Focus visible (outline primary)
- Transiciones 150–200ms; respetar `prefers-reduced-motion`
- Iconos MUI existentes (sin emojis)

### Capas frontend

| Archivo | Cambio |
|---------|--------|
| `lib/api/menu.ts` | `permanentlyDeleteProductsBulk(token, restaurantId, productIds)` |
| `services/db/supplierProducts.ts` | Helper que llama al bulk endpoint |
| `lib/menu/deleteConfirmCopy.ts` | Variante bulk (`kind: 'products'`, count) |
| `ProductsPage.tsx` + `.module.css` | Checkboxes, action bar, confirm, llamada API, limpieza de selección |

### Errores UI

| Caso | UI |
|------|-----|
| `404` / fallo atómico | Banner en tab products: no se eliminó ninguno; selección se mantiene |
| Red / 5xx | Banner genérico; selección se mantiene |
| Éxito | Quitar de lista / recargar página (mismo patrón que delete unitario); limpiar selección |

## Testing

### Backend

1. Bulk de N productos del restaurant → filas ausentes; option groups ausentes
2. Un ID inválido en el lote → `404`; ninguno se borra
3. Lista vacía → `400`
4. Producto con order line → order line sigue; `product_id is NULL`
5. Soft `DELETE` y `/permanent` unitario sin cambio de comportamiento

### Frontend

- Smoke: seleccionar varios → confirm → desaparecen
- “Seleccionar todos” = solo página actual
- Cambiar página limpia selección
- Responsive: desktop / tablet / móvil (action bar usable)

## Fuera de alcance

- Bulk delete de categorías
- Otras acciones bulk (visibilidad, mover categoría, etc.)
- Borrar archivos de imagen en object storage
- Exponer bulk al assistant
- Delivery dashboard

## Archivos previstos

- `backend/app/modules/menu/schemas.py`
- `backend/app/modules/menu/repository.py`
- `backend/app/modules/menu/adapters.py`
- `backend/app/modules/menu/service.py`
- `backend/app/modules/menu/api.py`
- `backend/tests/modules/` (tests de bulk hard-delete)
- `frontend/src/lib/api/menu.ts`
- `frontend/src/services/db/supplierProducts.ts`
- `frontend/src/lib/menu/deleteConfirmCopy.ts`
- `frontend/src/components/pages/ProductsPage.tsx`
- `frontend/src/components/pages/ProductsPage.module.css`
