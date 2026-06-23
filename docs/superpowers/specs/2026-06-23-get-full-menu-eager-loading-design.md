# get_full_menu N+1 Fix — Design Spec

> Status: **Implemented**
> Scope: Backend — `SqlAlchemyMenuRepository.get_full_menu` (y `get_preview_menu`, mismo patrón)

## Goal

Eliminar el problema N+1 al cargar el menú público en cache miss. Hoy `get_full_menu` dispara cientos de queries cuando hay muchos productos; el objetivo es acotar las queries a un número **fijo** (~5–7) independiente del número de productos.

## Problem

`get_full_menu` hace 2 queries base (categorías + productos) y luego, **por cada producto**, `_product_to_dto` provoca:

| Acceso | Queries extra por producto |
|--------|--------------------------|
| `_category_sort_indices(session, product_id)` | 1 explícita |
| `obj.categories` (lazy) | 1 |
| `obj.option_groups` (lazy) | 1 |
| `group.items` por cada grupo (lazy) | 1 × grupos |

Con 80 productos → fácilmente **240+ round-trips** a Postgres/Supabase.

## Success criteria

1. `get_full_menu` devuelve el **mismo** `FullMenuDTO` que antes (mismos campos, mismos filtros, mismo orden).
2. El número de queries SQL durante `get_full_menu` es **O(1)** respecto al conteo de productos (techo razonable: ≤10 queries para menús típicos).
3. Tests existentes de menú siguen pasando.
4. Nuevo test verifica el techo de queries con varios productos + option groups.

## Non-goals

- Cambiar el shape del API o del `FullMenuDTO`.
- Menú “lite” sin `option_groups` (optimización de payload — trabajo aparte).
- Optimizar `get_product` / `list_products` individuales (siguen con `_product_to_dto` per-item; aceptable para CRUD).
- Redis cache (ya existe; este cambio acelera cache miss e invalidaciones).

## Approaches considered

### A — `selectinload` + batch `category_sort_indices` (recomendado)

- Una query de productos con `selectinload(Product.categories)`, `selectinload(Product.option_groups).selectinload(OptionGroup.items)`.
- Una query batch: `SELECT product_id, category_id, sort_index FROM product_categories WHERE product_id IN (...)`.
- Ensamblar DTOs en memoria sin tocar la DB en el loop.

**Pros:** Patrón estándar SQLAlchemy 2.x; cambio localizado en `adapters.py`; sin migraciones.  
**Cons:** Sigue cargando option_groups completos (payload igual que hoy).

### B — Query SQL cruda / vista materializada

**Pros:** Máximo control.  
**Cons:** Duplica lógica de ORM; más mantenimiento. Rechazado.

### C — Solo batch sort indices, sin eager load

**Pros:** Menor diff.  
**Cons:** Sigue N+1 en categories y option_groups. Insuficiente.

**Recomendación: A**

## Architecture

```
adapters.py
├── _category_sort_indices_batch(session, product_ids) → dict[UUID, dict[str, int]]
├── _product_to_dto(obj, session?, *, category_sort_indices?)  ← índices opcionales pre-cargados
├── _products_to_dtos(session, products)                     ← batch path
├── _load_menu_products(session, restaurant_id, published_only) ← query + selectinload
├── get_full_menu()      → categories query + _load_menu_products(published_only=True) + _products_to_dtos
└── get_preview_menu()   → mismo helper con published_only=False
```

### Eager loading strategy

Usar **`selectinload`** (no `joinedload`) porque:

- Productos tienen colecciones (categories M2M, option_groups 1-N con items).
- `selectinload` emite `WHERE product_id IN (...)` — evita explosión de filas duplicadas en JOINs.

### Batch sort indices

```sql
SELECT product_id, category_id, sort_index
FROM product_categories
WHERE product_id IN (:ids)
```

Mapear a `{product_id: {str(category_id): sort_index}}`. Productos sin filas → `{}`.

### Backward compatibility

- `_product_to_dto(obj, session)` sin `category_sort_indices` sigue funcionando para `get_product`, `add_product`, etc.
- Rutas batch pasan índices pre-cargados y **no** llaman `_category_sort_indices` per-item.

## Error handling

Sin cambios: restaurante inexistente sigue manejado arriba (`MenuCacheService`); menú vacío → `categories=[]`, `products=[]`.

## Testing

| Test | Qué verifica |
|------|----------------|
| Tests existentes en `test_menu_repo.py` | Regresión funcional |
| `test_get_full_menu_bounded_query_count` (nuevo) | ≤10 queries con 5 productos, 2 categorías c/u, 1 option group c/2 items |
| `test_category_sort_indices_batch` (nuevo, unit-style con DB) | Batch devuelve mismos índices que `_category_sort_indices` individual |

## Rollout

Solo deploy backend. El menú cacheado en Redis no requiere invalidación extra; próximo cache miss ya usa el path optimizado.
