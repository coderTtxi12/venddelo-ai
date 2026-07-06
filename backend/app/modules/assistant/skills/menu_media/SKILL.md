---
name: menu_media
description: Generate appetizing AI food photos for menu products (reads full product context, uploads to storage, sets image_path). Use when the owner wants photos for products missing images or asks to create menu pictures.
---

# menu_media

Generate **appetizing food photography** for products on the digital menu.

## When to use

- Owner asks to **create/generate photos** for products without `image_path`.

## Workflow

1. **`menu_read`** — `list_products` (or `get_product`)
2. **Confirm with the owner** — list the products you will generate for (names + count). Image generation is a **mutation** and costs API credits.
3. **`generate_product_image`** — one product per call.
4. Summarize results with product names and mention they can review photos in the live menu.

Optional: **`load_skill(menu_best_practices)`** for photo quality guidelines before proposing generation.

## Tools

### `generate_product_image` (mutate)

Generates one photo and sets `image_path` on the product.

**Before generating**, the tool automatically loads:

- name, description, categories
- active add-ons / complements (`option_groups`)
- linked promotions

**Args:** `product_id` or `name` / `product_name`; optional `style_notes`; `force=true` to replace an existing image.

If many products need images, list them for the owner, confirm priorities, then call this tool once per product (or in small batches the owner approves).

## Quality rules

- Professional menu-style food photography
- Warm lighting, appetizing, photorealistic
- No text, logos, watermarks, people, or hands in the image

Do **not** invent dish details beyond what `menu_read` / the tool context provides.

## Errors

- Product already has an image → use `force=true` or skip.
- Ambiguous name → disambiguate with the owner, then retry with `product_id`.
- Generation/storage failure → report which product failed.
