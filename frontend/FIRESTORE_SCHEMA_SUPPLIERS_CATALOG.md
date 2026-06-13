# Firestore DB Design — Supplier Catalog (Categories, Products, Options)

This document proposes a Firestore schema for a **supplier-managed catalog** (categories + products) that becomes visible in the **Tienda Go mobile marketplace** only after **admin approval** (Tienda Go Panel).

All deletions are **soft deletes** (flags), never hard delete.

## Goals & constraints

- A **supplier** can manage:
  - **categories** (optional image)
  - **products** (optional image)
  - product **option groups** (like PedidosYa): required single choice vs optional multi choice, with optional extra price per option
- A product can belong to **1..N categories**, but **must belong to at least 1**.
- Products are visible to mobile marketplace users only when:
  - supplier sets product as **submitted for review**
  - admin sets **approved**
  - admin sets **published**
- All entities support soft delete via `isActive` (and optionally `deletedAt`).

## Naming conventions

- IDs are document IDs (AutoID or your own).
- Timestamps use Firestore `serverTimestamp()` and are stored as `Timestamp`.
- Emails are stored normalized: `emailLower = email.trim().toLowerCase()`.
- Money fields should be stored in **cents** to avoid float issues.

## Top-level collections

### `suppliers`

Existing collection. Each supplier document can own categories/products.

**Document**: `suppliers/{supplierId}`

Relevant fields (existing + proposed):
- `email`: string (normalized lowercase)
- `access`: boolean (login gating)
- `isActive`: boolean (optional, if you also want soft delete at supplier level)

## Supplier-owned subcollections (recommended)

Using subcollections keeps supplier data isolated and makes queries simpler/scoped.

### `suppliers/{supplierId}/categories`

**Document**: `suppliers/{supplierId}/categories/{categoryId}`

Fields:
- `name`: string (required)
- `description`: string | null
- `image`: map | null
  - `storagePath`: string (e.g. `supplier-categories/{supplierId}/{categoryId}/image.jpg`)
  - `downloadUrl`: string | null (optional if you store URLs)
  - `contentType`: string | null
  - `width`: number | null (optional)
  - `height`: number | null (optional)
- `sortIndex`: number (optional; for ordering)
- `isActive`: boolean (**soft delete**; default `true`)
- `createdAt`: Timestamp
- `updatedAt`: Timestamp
- `deletedAt`: Timestamp | null (optional)

Indexes (if needed):
- `isActive` + `updatedAt` (for admin views / ordering)

### `suppliers/{supplierId}/products`

**Document**: `suppliers/{supplierId}/products/{productId}`

Core fields:
- `name`: string (required)
- `description`: string | null
- `image`: map | null (same shape as category image)
- `price`: map (required)
  - `currency`: `"USD"`
  - `unitAmountCents`: number (e.g. 1299 for $12.99)
- `discount`: map | null (optional)
  - `type`: `"amount"` | `"percent"` (start with `"amount"` if you want)
  - `amountCents`: number | null (when type = amount)
  - `percent`: number | null (0..100 when type = percent)
  - `startsAt`: Timestamp | null
  - `endsAt`: Timestamp | null

Category relationship:
- `categoryIds`: string[] (**required**, length >= 1)
  - contains IDs of `suppliers/{supplierId}/categories/{categoryId}`

Visibility / workflow (admin approval):
- `review`: map
  - `status`: `"draft"` | `"pending_review"` | `"approved"` | `"rejected"`
  - `submittedAt`: Timestamp | null
  - `reviewedAt`: Timestamp | null
  - `reviewedByAdminId`: string | null (admin panel user id)
  - `rejectionReason`: string | null
- `publish`: map
  - `isPublished`: boolean (only admin should set `true`)
  - `publishedAt`: Timestamp | null
  - `unpublishedAt`: Timestamp | null

Soft delete:
- `isActive`: boolean (default `true`)
- `deletedAt`: Timestamp | null

Audit-friendly fields:
- `createdAt`: Timestamp
- `updatedAt`: Timestamp

Optional operational fields:
- `sku`: string | null
- `stock`: map | null (if/when you manage inventory)
  - `trackInventory`: boolean
  - `quantity`: number
  - `updatedAt`: Timestamp

Indexes (likely):
- `isActive` + `review.status` + `updatedAt`
- `isActive` + `publish.isPublished` + `updatedAt`

## Option groups (PedidosYa-style)

You have two common modeling options:

### Option A (recommended): embedded arrays in product document

Best when option groups are not huge and you need **single read** for mobile.

Add to `products/{productId}`:

- `optionGroups`: array of maps
  - `id`: string (stable id for edits)
  - `title`: string (e.g. "How do you like your pozole?")
  - `required`: boolean
  - `selection`: `"single"` | `"multi"`
  - `minSelections`: number
  - `maxSelections`: number | null
    - For **required** groups (UX rule): enforce **single** choice with min=1, max=1
    - For optional multi: min=0, max=null (or a number cap)
  - `isActive`: boolean (soft delete group)
  - `items`: array of maps
    - `id`: string
    - `label`: string
    - `priceDeltaCents`: number (e.g. 400 for +$4.00)
    - `isActive`: boolean

Mobile ordering validation:
- For each `optionGroup`, enforce selection count between `minSelections` and `maxSelections`.
- For `"single"`, store a single `selectedItemId`.
- For `"multi"`, store `selectedItemIds: string[]`.

### Option B: subcollections under product

Use when you expect many groups/items or want granular updates.

- `suppliers/{supplierId}/products/{productId}/optionGroups/{groupId}`
- `suppliers/{supplierId}/products/{productId}/optionGroups/{groupId}/items/{itemId}`

This is more writes/reads; for mobile you’ll often need aggregation or multiple queries.

## Mobile marketplace read model (recommended)

Mobile app should query only:

- supplier products where:
  - `isActive == true`
  - `review.status == "approved"`
  - `publish.isPublished == true`

Depending on your marketplace structure, you may also denormalize to a global collection for faster browsing:

### Optional denormalized collection: `marketplace_products`

**Document**: `marketplace_products/{productId}`

Fields (subset):
- `supplierId`: string
- `name`, `description`, `image`, `price`, `discount`
- `categoryRefs`: array (or `categoryIds`)
- `optionGroups`: embedded
- `publishedAt`: Timestamp
- `isActive`: boolean

This is maintained by:
- Cloud Function trigger on approved/published supplier products, or
- Admin panel writes.

## Soft delete rules (flags)

Use consistent flags across documents:
- `isActive: true|false`
- `deletedAt: Timestamp|null`

Behavior:
- UI lists should filter `isActive == true`
- Disabling a category should not hard delete products; instead:
  - keep category doc `isActive=false`
  - in UI, prompt supplier to reassign products to another category

## Security rules (high level)

- Suppliers can read/write only under their own `suppliers/{supplierId}/...` subtree.
- Suppliers can set `review.status` only to:
  - `draft` or `pending_review`
  - They must NOT be able to set `approved`, `rejected`, or `publish.isPublished=true`
- Admin panel can set:
  - `review.status` to approved/rejected + review metadata
  - `publish.isPublished` true/false

## Example product document (Option A)

```json
{
  "name": "Pozole (Large)",
  "description": "Large bowl, includes tostadas and salsa.",
  "price": { "currency": "USD", "unitAmountCents": 1200 },
  "discount": { "type": "amount", "amountCents": 0, "startsAt": null, "endsAt": null },
  "categoryIds": ["cat_abc123"],
  "review": {
    "status": "pending_review",
    "submittedAt": "Timestamp",
    "reviewedAt": null,
    "reviewedByAdminId": null,
    "rejectionReason": null
  },
  "publish": { "isPublished": false, "publishedAt": null, "unpublishedAt": null },
  "optionGroups": [
    {
      "id": "og_1",
      "title": "How do you like your pozole?",
      "required": true,
      "selection": "single",
      "minSelections": 1,
      "maxSelections": 1,
      "isActive": true,
      "items": [
        { "id": "oi_1", "label": "Maciza", "priceDeltaCents": 0, "isActive": true },
        { "id": "oi_2", "label": "Cabeza de Cerdo", "priceDeltaCents": 400, "isActive": true }
      ]
    },
    {
      "id": "og_2",
      "title": "Pozole add-ons",
      "required": false,
      "selection": "multi",
      "minSelections": 0,
      "maxSelections": null,
      "isActive": true,
      "items": [
        { "id": "oi_3", "label": "Lechuga", "priceDeltaCents": 0, "isActive": true },
        { "id": "oi_4", "label": "Rábano", "priceDeltaCents": 400, "isActive": true }
      ]
    }
  ],
  "isActive": true,
  "deletedAt": null,
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

