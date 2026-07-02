---
name: menu_best_practices
description: Reference guide for digital menu quality — structure, category order, product copy, photos, add-ons, promotions, and audit checklists (no tools). Call load_skill when the owner asks for recommendations or wants to improve any menu element before using menu_read or menu_write.
---

# menu_best_practices

**Best-practices guide for digital menus**, aligned with proven
catalog standards and adapted to this platform's data model (categories, products, add-ons,
promotions, branding).

**This skill has no tools.** It does not read or write the menu. Use it as reference when:

- The owner asks for **recommendations**, an audit, or "how do I improve my menu?".
- You are about to use **`menu_write`** and want quality criteria before/after editing.
- You need to explain **why** a structure works (categories, add-ons, promos).

For live restaurant data, use **`menu_read`**. To apply changes, use **`menu_write`**.
This guide tells you *what* to look for and *how* things should look; the other skills execute.

---

## Mandatory workflow (improve / optimize / edit)

When the owner wants to **improve, optimize, recommend, audit, or edit** any menu element,
follow this order **before** proposing or applying changes:

```
1. load_skill(menu_best_practices)   ← this guide (if not loaded this turn)
2. menu_read tools                   ← live categories, products, promos, AND add-ons
3. Recommend or preview              ← combine guide + real data
4. menu_write (optional)             ← only after owner confirms
```

**Do not skip step 1 or 2** to guess from memory or generic advice. If the owner names one
product (e.g. "mejora la descripción de HAMBURGUESA"), still load this guide and read that
product with `menu_read` (`search_products` / `get_product`) before drafting copy.

### What "read the menu" actually requires

For a **full audit**, read the whole picture — not a subset:

| To comment on… | You must call | Note |
|----------------|---------------|------|
| Category structure / order | `list_categories` | — |
| Products, names, prices, published state | `list_products` (paginate until `has_more=false`) | Covers every product |
| **Photos, descriptions, complements/add-ons** | `list_products` | Each product already includes `image_path`, `description`, and full `option_groups` + items |
| Promotions attached to a specific product | `get_product` | Adds `promotions` on top of the same product data |
| All promotions | `list_promotions` | — |

`list_products` returns the full product record (description, photo, price, complements), so
it already covers products/photos/add-ons. `get_product` only adds the promotions affecting
one product — use it when a promo interaction matters, not to see add-ons.

**Hard rule — no unread claims.** Never say a product lacks a photo, has empty complements,
has a bad description, or a wrong price unless a `menu_read` result **this turn** shows it.
Reading only categories + promotions and then talking about products, photos, or add-ons is
inventing data — forbidden. If you have not read products yet, read them before the audit
(or tell the owner you still need to check them).

---

## Impact (why it matters)

On Venddelo, a digital menu with **photos, complete names, and descriptions** can
**increase conversion by up to ~90%**. An attractive photo **doubles** purchase
probability. Customers decide from what they see and read — not from the physical menu.

Operational translation for the agent:

| Menu signal | Expected effect |
|-------------|-----------------|
| Product without photo | Far fewer clicks and add-to-cart events |
| Vague name ("Special combo") | Abandonment / confusion |
| Empty or generic description | Less trust, more support tickets |
| Messy or too many categories | Decision fatigue |
| No add-ons on main dishes | Lower average ticket |
| Price differs from the physical store | Bad reviews and cancellations |

---

## When to activate this skill

| Owner intent | What to do |
|--------------|------------|
| "How do I optimize my menu?" / "give me tips" | Activate this skill → respond with concrete recommendations |
| "Review my menu" / "what's missing?" | Activate **`menu_read`** + this skill → audit against the checklist |
| "Improve descriptions / photos / order" | Activate **`menu_read`**, **`menu_write`**, and this skill → propose Venddelo-aligned changes |
| "How do I set up a 2×1 / promo?" | This skill (rules) + **`menu_read`** (state) + **`menu_write`** (create) |

Respond to the owner in **Spanish**, with clear markdown.

---

## Map: catalog concepts → this system

| Delivery menu concept | On Venddelo | Typical tools |
|-----------------------|-------------|---------------|
| Aisle / category | `categories` (`name`, `sort_index`, `display_layout`, `is_active`) | `list_categories`, `create_category`, `reorder_categories`, `update_category` |
| Product / dish | `products` (`name`, `description`, `price_cents`, `image_path`, M:N categories) | `list_products`, `get_product`, `create_product`, `update_product` |
| Topping group | `option_groups` (`title`, `required`, `selection`, `min/max_selections`) | `add_option_group`, `update_option_group` |
| Topping / option | `option_items` (`label`, `price_delta_cents`, `is_active`) | `add_option_item`, `update_option_item` |
| Marketing promo (2×1, banner) | `promotions` type `bundle` (NxM), scope product/category | `create_promotion`, `set_promotion_targets` |
| Product discount | `promotions` type `percent` / `amount` (`is_catalog_discount`) | `apply_product_discount`, `update_promotion` |
| Visual badge, no math | `promotions` type `combo` (`priced_in_cart=false`) | `create_promotion` |
| Logo / cover / theme | `restaurants` branding | `update_restaurant` |
| "Turn off" a product | `is_active=false` (never delete) | `set_product_active`, `update_option_*` |
| Photos | `image_path` on product/category/promo | `generate_image`, `enhance_image` + `update_*` |

---

## 1. Category structure (aisles)

### Count and order

Venddelo recommends **5–7 intuitive categories**, ordered by **commercial importance**:

1. **Promotions** (dedicated aisle — e.g. "Promociones" or "Ofertas") By default the system puts this at first
2. **Starters** / snacks
3. **Main dishes** / best sellers
4. **Sides**
5. **Desserts** and **Drinks** (sometimes split)

On this platform: `reorder_categories` + `sort_index` on each category. The **first two
categories** should hold best sellers and/or highest-ticket items — that's what the customer
scrolls first.

### Category names

| Venddelo rule | Application |
|---------------|-------------|
| Short and precise: "Burgers", "Combos", "Drinks" | Avoid long phrases in the name |
| Max **~30 characters** in-app | If the name is long, shorten the title and detail in the category description |
| No duplicate aisle names | One "Drinks", one "Promos" |
| Min **3 products** per normal aisle | Promo aisle: min **1** product |
| Don't put combo price in the aisle name | Use a "Promotions" category and describe the deal on the product/description |

**Bad:** "All burgers + Fries for $199"  
**Good:** category **Promotions** → product **Burger + Fries Combo** with a clear description.

### Category layout

Use `display_layout` when it helps:

- **`list`** — default; many items with longer text
- **`grid`** — drinks, desserts, visual items
- **`horizontal`** — featured carousel

Example: Drinks category in **`grid`** improves visual scanning.

---

## 2. Products: name, description, price

### Name (max ~40 characters)

- **Specific and self-explanatory** — the customer should understand the dish from the title alone.
- **No emojis**, no unnecessary special characters.
- **No price or discount %** in the name (Venddelo catalog review rejects this).
- Include **dish type** in the name when ambiguous:
  - Good: "Beef burger", "Green salad", "Pepperoni pizza"
  - Bad: "House special", "Combo 1"

If the name **does not** state the type (e.g. "The special"), the **description must**.

### Description (max ~150 characters)

Must be **objective and useful**, not empty marketing:

| Include | Avoid |
|---------|-------|
| Main ingredients | "Delicious", "tasty", "exquisite" |
| Size / pieces / ml ("12 BBQ wings", "350 ml") | Repeating price or "50% off" |
| What a combo includes (each item + drink size) | Subjective filler that wastes characters |
| Mandatory add-on choice when applicable | Description that contradicts `option_groups` |

**Recommended examples:**

- "Spaghetti, bolognese sauce, ground beef, parmesan and oregano."
- "12 BBQ wings with ranch dressing."
- "150 g beef burger, tomato, onion, lettuce, cheddar cheese."
- Combo: "150 g beef burger, medium fries and 400 ml soda of your choice."

If the description says "drink of your choice", a matching **add-on group must exist** —
don't list options in text only.

### Price

- **Same as the physical store** (same currency/experience). In system: integer `price_cents` (MXN).
- Base price **does not include** promos; explain them separately (`promotions` on `get_product`).
- Sharp increases (>10% may trigger a catalog warning) — warn the owner before a large hike.

### Branded drinks

Venddelo requires **Brand + variation/flavor + size**:

- Product: **Coca-Cola Original 350 ml** (Drinks category)
- Description: type such as "Soft drink" or "Soda"

**Do not** use standalone drinks as toppings except in combos where the customer **chooses**
among brands in a "Choose your drink" group. Outside combos, each drink = its own **product**.

---

## 3. Photography

Venddelo recommends that **every dish should have a quality photo**. Checklist:

| Criterion | Detail |
|-----------|--------|
| Framing | Horizontal; product **centered**; **100%** of the dish visible |
| Lighting | Natural light; no harsh flash; no strong shadows |
| Background | Neutral and **consistent** across the store's products |
| Presentation | Fresh, clean plate; no distractions |
| Angle | ~**45°**, same angle per category when possible |
| Consistency | Photo must match name and description |
| Forbidden in photo | Prices, discount %, phone numbers, logo >25% of frame, unappealing disposable packaging, inappropriate content |

On this platform: if `image_path` is missing, offer **`generate_image`** or **`enhance_image`**
(via `menu_write`) with concrete prompts (dish, visible ingredients, natural light, neutral
background). After generating, apply with `update_product` / `update_category`.

---

## 4. Add-ons (groups and options)

On Venddelo, topping groups = **`option_groups`** + **`option_items`**.

### When to use them

- **Whenever the dish allows** — they increase ticket size and clarity. The objetive is that the customer has all the information and doesn't need to contact the restaurant. 
- Sizes, protein, sauces, extras, drink choice in combos.
- Included drink "of your choice" → required group with each brand/size as a separate item.

### Recommended configuration

| Field | Guidance |
|-------|----------|
| `title` | Clear: "Size", "Choose your drink", "Extras" |
| `required` | `true` when the customer **must** choose (size, combo drink) |
| `selection` | `single` for one choice; `multi` for several extras |
| `min_selections` / `max_selections` | Match the business rule |
| `price_delta_cents` | $0 for included items; positive for upsell |
| `is_active` | Disable out-of-stock toppings without deleting |

### Common mistakes (catalog rejection reasons)

| Mistake | Fix |
|---------|-----|
| Group created **with no items** | Add each option with `add_option_item` |
| All drinks in **one** item | Split: Coca-Cola Original 350 ml; Fanta Orange 350 ml; … |
| Topping "Coca-Cola" without size/brand | Full Brand + variation + ml format |
| Description says "of your choice" but no group | Create matching required group |
| Standalone drink sold as topping | Create product in Drinks category |

### Reuse

When several products share the same structure (e.g. "Choose your drink"), replicate the same
group/item pattern for consistency — reuse an existing group's structure across products.

---

## 5. Promotions and discounts

This system separates **marketing campaigns** from **catalog discounts**. Don't mix concepts when advising.

### NxM / 2×1 (`type: bundle`)

- Dedicated aisle or highlighted products under **Promotions**.
- Requires a banner **`image_path`** when creating a marketing campaign.
- Scope **`product`**, **`products`** or **`category`** — does not apply to the whole order.
- Explain to the owner: paid add-ons **are always charged**; some add-ons can **drop a unit
  from the 2×1** if listed as non-participants (`option_participation` in `menu_read`).

### Percent / amount discounts

- For "15% off these products" → `apply_product_discount` (no banner).
- **Do not** put the % in the product name.

### Combo badge (`type: combo`)

- Visual label only; **does not change** checkout total.
- Useful for pre-built packages priced in `price_cents`.

### Good practices

- Short promo name ("2×1 Wings", "Family Combo").
- Clear targets (`set_promotion_targets`).
- Schedule/dates when temporary (`starts_at`, `ends_at`, schedule).
- Disable with `disable_promotion` when it ends — never "delete".

---

## 6. Order within categories

Venddelo and delivery conversion research agree:

- **Positions 1–3** in each category: best sellers and most profitable dishes.
- **Don't** default to alphabetical order if it hurts sales.
- Price anchoring: showing premium options first makes the rest feel reasonable.

Tool: `reorder_products` with `category_id` + ordered `product_ids` list.

---

## 7. Store branding

Logo, cover, and restaurant description build trust in the Venddelo storefront.

- **`update_restaurant`**: `name`, `description`, `logo_path`, `cover_path`, theme/colors.
- Visual consistency between cover and product photos.
- Toggle automatic **Promotions** / **Limited time** category if the owner uses those dynamic aisles.

---

## 8. Availability

Venddelo lets merchants turn off products/toppings for a day, a week, or indefinitely.

Here: **`set_product_active(false)`** or `update_option_item(is_active=false)` — never delete.
Tell the owner to disable out-of-stock items **before** impossible orders arrive.

---

## 9. Audit checklist (with `menu_read`)

When the owner asks for a review, walk through in this order:

1. **`list_categories`** — reasonable count (5–7)? commercial order? short names?
2. **`list_products`** (paginated) — per product note:
   - Has `image_path`?
   - Name ≤40 chars, specific, no price/promo in title?
   - Description ≤150 chars with ingredients/size?
   - Price consistent with what the owner says?
3. **`get_product`** on key items — do `option_groups` match the description?
   Required groups where needed?
4. **`list_promotions`** — clear active promos? NxM with image? discounts not spammed in names?
5. Summarize findings by **priority**: critical (catalog rejection / zero conversion) → improvement → nice-to-have.
6. Offer a **`menu_write`** plan in small batches; confirm before bulk changes.

---

## 10. How to propose improvements (tone and process)

1. **Diagnosis** — 3–5 concrete bullets with examples from *their* products (after `menu_read`).
2. **Quick wins** — missing photos, rename 2–3 items, reorder main category.
3. **Next step** — ask whether they want you to apply changes or guidance only.
4. When writing new descriptions, respect ~150 character limit and include objective facts.
5. When generating images, describe the real dish + 45° angle + neutral background + natural light.

Do not claim exact metrics for the owner's restaurant; you may cite general Venddelo benchmarks
(~90% conversion with a complete menu, 2× probability with a good photo).

---

## 11. Anti-patterns (summary)

| Avoid | Do instead |
|-------|------------|
| "Special combo" with no detail | Name + itemized description |
| Promo only in the name | Promo in Promotions section + `create_promotion` |
| 15+ categories | Consolidate into 5–7 aisles |
| Orphan products with no category | Always ≥1 `category_id` on create |
| Empty or generic "Extras" group | Items with price and full name |
| Discount in title | `apply_product_discount` |
| Inventing ingredients | Ask the owner or read the current menu |
| Asserting final promo price | Explain base + promo; checkout computes total |

---

## Scope of this guide

These rules reflect **Venddelo catalog standards** for categories, products, add-ons,
photography, and promotions (`categories`, `products`, `option_groups`, `promotions`,
branding). When a generic suggestion conflicts with the restaurant's live data, **the live
menu wins** (`menu_read`).
