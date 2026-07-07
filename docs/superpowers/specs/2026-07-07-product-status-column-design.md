# Product `status` Column — Design Spec

**Date:** 2026-07-07  
**Status:** Approved for planning (scope: full stack)

## Problem

Product visibility is split across three persisted fields (`is_active`, `is_published`, `approval_status`) plus a computed assistant field (`live_menu_status`). Owners and the agent think in three states; the DB does not.

This causes:

- Confusing agent tools (`update_product` exposes 3 flags)
- `is_active=false` incorrectly sets `deleted_at` in adapters (coupled to `SoftDeleteMixin`)
- Unused workflow values (`pending_review`, `rejected`) in constraints but not in owner UX

## Goal

Replace product visibility flags with **one column**:

| `status` | Public menu | Orderable | Owner label (ES) |
|----------|-------------|-----------|------------------|
| `active` | Visible | Yes | En menú |
| `inactive` | Visible (No disponible) | No | Inactivo |
| `draft` | Hidden | No | Draft |

## Non-goals

- Changing category / option group / option item `is_active` semantics
- Removing true product archival — if needed later, use explicit delete flow (not part of this spec)
- Renaming frontend `ProductVisibilityState` values (`live`/`hidden`/`inactive`) — map to/from API `status`

## Database

### New column

```sql
ALTER TABLE products ADD COLUMN status VARCHAR NOT NULL DEFAULT 'draft';
ALTER TABLE products ADD CONSTRAINT ck_products_status_allowed
  CHECK (status IN ('active', 'inactive', 'draft'));
```

### Data migration

```text
is_published AND approval_status = 'approved' AND is_active  → active
is_published AND approval_status = 'approved' AND NOT is_active → inactive
else → draft
```

### Columns removed

- `is_published`
- `approval_status`

### `SoftDeleteMixin` on `Product`

Remove `Product` inheritance from `SoftDeleteMixin`. Product visibility is fully expressed by `status`. Drop `deleted_at` coupling on product update.

If `products.deleted_at` / `products.is_active` exist from mixin, migration drops them after backfill (or keeps `deleted_at` nullable unused — prefer **drop both** for products to avoid ambiguity).

### Indexes

Replace:

- `ix_products_publish (restaurant_id, is_active, is_published)`
- `ix_products_review (restaurant_id, approval_status)`

With:

- `ix_products_status (restaurant_id, status)`

## Backend API / schemas

### `ProductDTO`, `ProductCreate`, `ProductUpdate`

```python
ProductStatus = Literal["active", "inactive", "draft"]

class ProductCreate(...):
    status: ProductStatus = "draft"

class ProductUpdate(...):
    status: ProductStatus | None = None

class ProductDTO(...):
    status: ProductStatus
```

Remove: `is_published`, `approval_status`, `is_active` from product schemas.

### Filtering rules

| Operation | Filter |
|-----------|--------|
| Owner list / assistant catalog | All statuses |
| Public `get_full_menu` | `status IN ('active', 'inactive')` |
| Order placement / cart quote | `status = 'active'` |
| `get_product` (owner default) | All statuses (by id) |

### Endpoints removed / simplified

- Remove `POST .../products/{id}/approval`
- Remove `POST .../products/{id}/publish`
- Remove `MenuService.set_approval()` / `publish()` product helpers

Visibility changes go through `PATCH` with `{ "status": "..." }`.

## Assistant

### `menu_read`

- Remove `_live_menu_status()` and `live_menu_status` from payloads
- Return `status` on every product payload
- Counts: `{ total, active, inactive, draft }` (rename from `en_menu`/`inactivo`/`draft`)
- `search_products` / `list_products` docs: refer to `status`

### `menu_write`

- `create_product`: optional `status` (default `draft`)
- `update_product`: single field `status` instead of `is_active` / `is_published` / `approval_status`
- Update `SKILL.md` with Spanish owner-facing labels and examples

### `product_resolve`

- `active_only` removed (already done for search); fuzzy scoring unchanged

## Frontend

### API types (`types.ts`)

Replace visibility flags with `status: 'active' | 'inactive' | 'draft'`.

### `productVisibility.ts`

Refactor to read/write `status` directly:

```typescript
export function getProductVisibilityState(product: { status?: ProductStatus }): ProductVisibilityState {
  switch (product.status) {
    case 'active': return 'live';
    case 'inactive': return 'inactive';
    default: return 'hidden';
  }
}

export function statusForVisibilityState(state: ProductVisibilityState): ProductStatus { ... }
```

Remove `visibilityUpdateForState()` triple-flag mapping.

### Components

- `ProductsPage`, `ProductVisibilitySelect`, `supplierProducts.ts`
- `orderableProducts.ts`, `menuProductUi.tsx`, cart validators — use `status === 'active'` for orderable, `status !== 'draft'` for listed

## Testing

- Migration unit test (mapping matrix)
- Menu repo: public menu includes active+inactive, excludes draft
- Orders: reject inactive/draft at checkout
- Assistant: `update_product({ status: 'active' })`, search/list counts
- Frontend: `productVisibility.ts` mapping tests

## Rollout

Single migration + deploy backend and frontend together (no dual-write period — small codebase, controlled DB).
