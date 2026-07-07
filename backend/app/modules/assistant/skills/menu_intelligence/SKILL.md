---
name: menu_intelligence
description: Analyze product photos with vision AI (read-only) to surface visible components, add-on ideas, and beverage pairings.
---

# menu_intelligence

Vision intelligence for **product photo analysis**.

## When to use

- Owner wants to understand what a product photo shows.
- *"Qué se ve en la foto de la hamburguesa?"*
- To surface add-on ideas or beverage pairings visible in the image before editing the menu.

## Important rules

- Tool is **read-only** — apply any menu change with **`menu_write`** after owner confirmation.
- Be specific to what is visible in the image; never invent packaging text.

## Workflow

1. **`menu_read`** — `get_product` (current `option_groups`, `image_path`).
2. **`analyze_product_image`** — vision analysis of the stored photo.
3. **Preview** findings to the owner in Spanish.
4. Owner confirms → **`menu_write`** to apply any changes.

## Tools

### `analyze_product_image` (read)

Vision analysis of the product photo in storage.

**Returns:** `analysis` with `visible_components`, `visible_add_on_ideas`, `beverage_pairing_ideas`, etc.

Requires `image_path` on the product.
