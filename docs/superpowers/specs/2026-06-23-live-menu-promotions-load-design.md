# Live Menu: Progressive Load + Promotions N+1 Fix — Design Spec

> Status: **Implemented**
> Scope: Frontend `PublicDigitalMenuPage` + Backend `SqlAlchemyPromotionRepository`

## Goal

1. **Frontend:** Mostrar el menú live en cuanto lleguen `restaurant` + `menu`, sin esperar promociones ni horarios.
2. **Backend:** Eliminar N+1 en `GET /public/restaurants/{subdomain}/promotions` al listar promos activas.

## Problem

### Frontend

`PublicDigitalMenuPage` usa `Promise.all` con 4 endpoints y `loading` solo pasa a `false` cuando **todos** terminan. Si promociones tarda (muchas promos de catálogo `__product_discount__`), el usuario ve spinner aunque el menú ya esté listo.

### Backend

`SqlAlchemyPromotionRepository._to_dto` ejecuta 3 queries por promo (`product_ids`, `category_ids`, `option_item_ids`). `list_active` → hasta 100 promos → **~302 queries** en el peor caso.

## Success criteria

1. Menú visible tras completar solo `getPublicRestaurant` + `getPublicMenu`.
2. Horarios y promociones cargan en segundo plano; fallo en secundarios no bloquea el menú.
3. `list_active` usa **≤5 queries** fijas independiente del número de promos (1 list + 3 batch junction + overhead aceptable).
4. Respuesta de promociones idéntica en shape y datos a la actual.
5. Tests de regresión + test de query count pasan.

## Non-goals

- Redis cache para promociones (fase posterior).
- Endpoint bootstrap unificado.
- Cambiar límite de 100 promos.

## Approach A — Batch junction tables (recomendado)

Tras `SELECT` de promos activas, 3 queries batch:

```sql
SELECT promotion_id, product_id FROM promotion_products WHERE promotion_id IN (...);
SELECT promotion_id, category_id FROM promotion_categories WHERE promotion_id IN (...);
SELECT promotion_id, option_item_id FROM promotion_option_items WHERE promotion_id IN (...);
```

Ensamblar DTOs en memoria. `_to_dto` individual se mantiene para `get` / `add` / `update`.

## Frontend design

```
load():
  1. Promise.all([restaurant, menu])  → set state, loading=false
  2. void loadSecondary([schedules, promotions])  → set state cuando lleguen
```

- `readPromotionsCache` en mount sigue aplicando (badges tempranos si hay cache).
- Errores en secundarios: `console.error`, sin `loadError` global.
- `schedules=[]` y `promotionsContext=null` hasta que lleguen — componentes ya usan `?? []` / fallbacks de timezone.

## Testing

| Test | Verifica |
|------|----------|
| `test_list_active_bounded_query_count` | ≤8 queries con 10 promos con products/categories |
| Tests existentes `test_promotions_repo.py` | Sin regresión |
| Manual | Menú aparece antes que badges de promo en red lenta |

## Files

- `backend/app/modules/promotions/adapters.py`
- `backend/tests/modules/test_promotions_repo.py`
- `frontend/src/components/pages/PublicDigitalMenuPage.tsx`
