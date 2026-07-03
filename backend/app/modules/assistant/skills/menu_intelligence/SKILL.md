---
name: menu_intelligence
description: Analyze product photos with vision and suggest NEW complement option groups/items (read-only proposals; apply with menu_write after owner confirms).
---

# menu_intelligence

Vision + catalog intelligence for **complement (add-on) suggestions**.

## When to use

- Owner asks to **generate/suggest complements** for a product.
- *"Qué complementos le pongo a la hamburguesa?"*
- After the product has a photo (`image_path`) or even without one (uses menu text + peers).

## Important rules

- **All complements are NEW `option_items` on the target product only.**
- **Never** link or reuse option_item IDs from other products.
- Beverage names from the menu are **inspiration for labels/prices**, not product links.
- Tools are **read-only** — apply with **`menu_write`** after owner confirmation.

## Workflow

1. **`menu_read`** — `get_product` (current `option_groups`, `image_path`).
2. Optional **`load_skill(menu_best_practices)`** for complement UX rules.
3. **`suggest_complements`** (or **`analyze_product_image`** first if owner only wants photo analysis).
4. **Preview** groups/items with prices to the owner in Spanish.
5. Owner confirms → **`menu_write`** `add_option_group` (+ `add_option_item` if adding to existing groups).

## Tools

### `analyze_product_image` (read)

Vision analysis of the product photo in storage.

**Returns:** `analysis` with `visible_components`, `visible_add_on_ideas`, `beverage_pairing_ideas`, etc.

Requires `image_path` on the product.

### `suggest_complements` (read)

Full proposal combining:

- Photo analysis (when `image_path` exists, `include_image_analysis=true`)
- Existing groups on the product (avoid duplicates)
- Peer products in the same categories (pattern inspiration)
- Beverage category products (naming/price inspiration)

**Returns:** `suggested_groups[]` with `title`, `selection`, `required`, `items[]` (`label`, `price_delta_cents`).

## Apply example (after confirm)

For each proposed group:

```
menu_write add_option_group
  product_id, title, required, selection, items: [{label, price_delta_cents}, ...]
```

Do **not** mutate until the owner approves the preview.
