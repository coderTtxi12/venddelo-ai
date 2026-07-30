# Eliminar productos y categorías en el dashboard

Fecha: 2026-07-29  
Alcance: `frontend/` (dashboard de dueños de restaurante)  
Rutas UX: tabs Categorías y Productos en `/products`

## Problema

Los dueños pueden crear, editar y activar/desactivar categorías y productos, pero no eliminarlos desde la UI. El backend ya expone `DELETE` (soft-delete) para ambos.

## Decisiones

| Decisión | Elección |
|----------|----------|
| Dónde vive la acción | En la lista: card de categoría / fila de producto |
| Confirmación | Obligatorio vía `ConfirmDialog` existente |
| Categoría con productos | Permitir eliminar; avisar en el confirm con el conteo |
| Backend | Sin cambios; reutilizar endpoints actuales |
| Undo | No; el copy debe decir que no se puede deshacer |
| Delivery dashboard | Fuera de alcance |

## UI

### Categorías

- Botón **Eliminar** en `cardActions`, junto a Activar/Desactivar.
- Estilo `dangerGhostBtn` (ya usado en la página).
- `stopPropagation` para no abrir el drawer de edición.

### Productos

- Botón **Eliminar** en la fila (columna de acciones o celda dedicada).
- `stopPropagation` para no abrir el editor.
- Icono SVG (`DeleteOutlineOutlinedIcon`, ya importado en la página) + texto o `aria-label` claro. Sin emojis.

### ConfirmDialog

Reutilizar `frontend/src/components/ui/ConfirmDialog.tsx` (`role="alertdialog"`, CTA rojo).

| Campo | Valor |
|-------|--------|
| Título | `¿Eliminar «{nombre}»?` |
| Cuerpo (producto) | Explicar que se quitará del catálogo y **no se puede deshacer**. |
| Cuerpo (categoría vacía) | Igual: irreversible. |
| Cuerpo (categoría con N productos) | Además: `Esta categoría tiene N producto(s) vinculados. Se eliminará de todas formas.` |
| Confirm | `Eliminar` |
| Cancel | `Cancelar` |
| Loading | Deshabilita ambos botones; texto `Procesando…` |

Conteo de productos vinculados: `products.filter((p) => p.categoryIds.includes(categoryId)).length` sobre el catálogo ya cargado en la página.

### Feedback

- Éxito: el ítem desaparece de la lista local (sin toast obligatorio).
- Error: banner con `role="alert"`.
- Sin sesión/restaurante: botón deshabilitado (mismo patrón que Activar/Desactivar).

## Flujo de datos

```
Click Eliminar
  → setPendingDelete({ kind, id, name }) + open ConfirmDialog
Confirm
  → loading = true
  → DELETE API
  → OK: quitar del state local, cerrar dialog
  → Error: loading = false, cerrar dialog, mostrar banner
Cancel / backdrop
  → clear pending, sin API
```

### API client (`frontend/src/lib/api/menu.ts`)

- `deleteCategory(token, restaurantId, categoryId)` → `DELETE /restaurants/{id}/categories/{categoryId}`
- `deleteProduct(token, restaurantId, productId)` → `DELETE /restaurants/{id}/products/{productId}`

Ambos esperan `204 No Content` (ya soportado por `apiRequest`).

### Capa DB

- `deleteSupplierCategory` en `supplierCategories.ts`
- `deleteSupplierProduct` en `supplierProducts.ts`
- Exportar desde `services/db/index.ts`

Patrón: igual que `updateSupplierCategoryActive` / `updateSupplierProductVisibility`.

## Errores

| Caso | Comportamiento |
|------|----------------|
| Red / 4xx / 5xx | Banner: `No se pudo eliminar {la categoría\|el producto}. Intenta de nuevo.` |
| Sin token/restaurant | Botón disabled; no llamar API |
| Doble submit | `loading` bloquea confirm/cancel |

No hay cascade-delete de productos al borrar una categoría. Los productos siguen existiendo; solo se elimina (soft-delete) la categoría.

## Testing

- Unit (opcional/ligero): helper de copy del confirm (0 vs N productos vinculados).
- Manual:
  1. Eliminar producto → desaparece.
  2. Cancelar confirm → sin cambios.
  3. Eliminar categoría vacía.
  4. Eliminar categoría con N productos → aviso con N; categoría desaparece.
  5. Forzar error de red → banner.

## Fuera de alcance

- Cambios en backend o políticas de soft-delete.
- Cascade o reasignación automática de productos.
- Eliminación masiva.
- Delivery dashboard.
- Página stub `CategoriesPage.tsx` (la UI real está en `ProductsPage` tabs).

## Archivos previstos

- `frontend/src/lib/api/menu.ts`
- `frontend/src/services/db/supplierCategories.ts`
- `frontend/src/services/db/supplierProducts.ts`
- `frontend/src/services/db/index.ts`
- `frontend/src/components/pages/ProductsPage.tsx`
- `frontend/src/components/pages/ProductsPage.module.css` (solo si hace falta layout de la columna Acciones)
- Opcional: helper + test de copy del confirm
