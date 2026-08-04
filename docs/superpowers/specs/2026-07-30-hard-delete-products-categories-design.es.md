# Hard-delete permanente de productos y categorías

Fecha: 2026-07-30  
Alcance: backend menu API + dashboard `frontend/` (botón Eliminar)  
Relacionado: `docs/superpowers/specs/2026-07-29-dashboard-delete-products-categories-design.es.md`

## Problema

El botón Eliminar del dashboard llama a `DELETE` existentes que **no** borran la fila:

- Categoría: soft-delete (`is_active=false` + `deleted_at`)
- Producto: pasa a `status=draft`

El copy del confirm ya dice que no se puede deshacer; el dueño espera borrado real en DB.

## Decisiones

| Decisión | Elección |
|----------|----------|
| Soft-delete actual | Se mantiene sin cambios |
| Hard-delete API | Endpoints nuevos `.../permanent` |
| Quién usa hard-delete | Botón Eliminar del dashboard restaurant owners |
| Categoría con productos | Solo borra la categoría; productos quedan (se desvinculan) |
| Órdenes | `order_items.product_id` → `ON DELETE SET NULL` (historial intacto) |
| Storage / imágenes | Fuera de alcance |
| Assistant / delivery-dashboard | Fuera de alcance |

## API

Owner-only (`require_owned_restaurant`), igual que el resto del menú.

```http
DELETE /api/v1/restaurants/{restaurant_id}/categories/{category_id}/permanent
→ 204 No Content

DELETE /api/v1/restaurants/{restaurant_id}/products/{product_id}/permanent
→ 204 No Content
```

Los endpoints actuales:

```http
DELETE .../categories/{category_id}
DELETE .../products/{product_id}
```

siguen con la semántica soft/draft actual.

### Errores

| Caso | Respuesta |
|------|-----------|
| No existe / otro restaurant | `404` |
| Sin auth / no owner | igual que resto del menú |

Tras éxito: invalidar cache de menú del restaurant (mismo patrón que soft-delete).

## Comportamiento en DB

### Producto

`session.delete(product)` (hard):

- CASCADE: `product_categories`, `option_groups` / `option_items`, vínculos de promociones a producto
- Órdenes: `product_id` queda `NULL`; líneas conservan snapshot de nombre/precio

### Categoría

`session.delete(category)` (hard):

- CASCADE: filas en `product_categories` para esa categoría
- Productos **no** se borran
- Vínculos promo por categoría CASCADE según FKs existentes

## Capas backend

| Capa | Cambio |
|------|--------|
| `MenuRepository` / adapters | `hard_delete_category(id)`, `hard_delete_product(id)` → `delete` + flush; **no** reutilizar soft_delete* |
| `MenuService` | `permanently_delete_category` / `permanently_delete_product` (ownership + 404) |
| `menu/api.py` | Dos rutas nuevas `/permanent` |

## Frontend

| Archivo | Cambio |
|---------|--------|
| `lib/api/menu.ts` | `permanentlyDeleteCategory`, `permanentlyDeleteProduct` → `DELETE .../permanent` |
| `services/db/supplierCategories.ts` | `deleteSupplierCategory` llama permanent |
| `services/db/supplierProducts.ts` | `deleteSupplierProduct` llama permanent |
| `ProductsPage` | Sin cambio de UX; el confirm ya advierte irreversibilidad |

## Testing

Backend (mínimo):

1. Hard-delete product → row ausente; option groups ausentes.
2. Hard-delete category con N productos → categoría ausente; productos siguen; sin filas en `product_categories` para esa categoría.
3. Hard-delete product referenciado en order line → order line sigue; `product_id is NULL`.
4. Soft `DELETE` actual de categoría/producto **no** cambia su comportamiento.

Frontend: smoke manual — Eliminar producto/categoría llama `/permanent` y desaparece de la lista.

## Fuera de alcance

- Borrar archivos de imagen en object storage
- Cascade hard-delete de productos al borrar categoría
- Exponer hard-delete al assistant
- Cambiar Activar/Desactivar / status draft
- Delivery dashboard

## Archivos previstos

- `backend/app/modules/menu/repository.py`
- `backend/app/modules/menu/adapters.py`
- `backend/app/modules/menu/service.py`
- `backend/app/modules/menu/api.py`
- `backend/tests/modules/` o `backend/tests/services/` (tests de hard-delete)
- `frontend/src/lib/api/menu.ts`
- `frontend/src/services/db/supplierCategories.ts`
- `frontend/src/services/db/supplierProducts.ts`
