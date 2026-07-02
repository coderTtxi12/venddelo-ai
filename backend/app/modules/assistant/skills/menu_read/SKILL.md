---
name: menu_read
description: Read-only access to menu categories, products, prices, options, and promotions.
---

# menu_read

Read-only access to the current restaurant menu: categories, products, prices, option groups, availability, **and promotions** (2×1/NxM, percent, amount, combo). All data is tenant-scoped; never mutate menu or promotion records from this skill.

**How this skill is wired:** when entitled, its tools are available as native function calls
(`menu_read__list_products`, etc.). Call `load_skill(menu_read)` only if you need this full
guide on disk; you do not need a separate "activation" step.

---

## How the data relates (quick map)

```
restaurant
 ├─ categories                      → list_categories
 └─ products (price_cents, flags)   → list_products / search_products / get_product
      ├─ product_categories         → category_ids + category_sort_indices (order in a category)
      └─ option_groups              → option_groups[] (size, extras…)
           └─ option_items          → items[] (label, price_delta_cents)

promotions (type, scope)            → list_promotions / get_promotion
 ├─ promotion_products              → product_ids   (scope=product)
 ├─ promotion_categories            → category_ids  (scope=category → hits products in those categories)
 └─ promotion_option_items          → option_item_ids (bundle allow-list / waived add-ons)
```

**Key links to remember:**
- A product ↔ promotion link lives in the **promotion**, not the product. A promo reaches a
  product by `product_ids` (scope=product), by `category_ids` (scope=category), or applies to
  the whole order (scope=order).
- **`list_products` / `search_products` carry NO promotion data.** Only `get_product`
  (field `promotions` / `has_promotions`) and `list_product_promotions` resolve a product's
  promos. To reason about promotions across many products, also call `list_promotions` and
  cross-reference its `product_ids` / `category_ids` against the catalog.
- Options are children of a product (`option_groups → option_items`); add-on price lives in
  `option_items.price_delta_cents`.

---

## When to Use This Skill

Use **`menu_read` tools** when the owner asks about **live catalog data** that is not already in:

- Conversation history or prior tool results in this turn

Typical intents:

- List or count categories
- Browse all products (paginated) or products in one category
- Search products by name or description
- Get full detail for one product (price, add-ons, status)
- List or navigate promotions (active now, by type or scope)
- Get full detail for one promotion (targets, schedule, how it discounts)
- **Improve / optimize / audit / recommend** the menu — always pair with
  `load_skill(menu_best_practices)` first, then read the relevant categories/products/promos
  here before proposing copy or structural changes

**Answer directly without tools** for greetings, identity, general advice, or when prior tool
results in this turn already contain accurate data.

---

## How to Use This Skill

Follow this workflow on every menu question:

### Step 1: Classify the Intent

| Owner asks… | Likely tool |
|-------------|-------------|
| "¿Qué categorías tengo?" | `list_categories` |
| "Lista todos mis productos" / "¿cuántos productos tengo?" | `list_products` (paginate with `cursor`) |
| "Productos de la categoría Tacos" | `list_categories` first if needed, then `list_products` + `category_id` |
| "Busca tacos al pastor" / "¿tienes X?" | `search_products` + `query` |
| "Detalle del producto {id}" / after search by id | `get_product` + `product_id` |
| "¿Qué opciones/tamaños/extras tiene X?" / "¿es obligatorio elegir?" | `get_product` (read `option_groups` + `selection_summary`) |
| "¿Cuántos productos (no) tienen promo?" | `list_products` + `list_promotions`, then cross-reference (see workflow) |
| "¿Qué promociones tengo?" / "promos activas" | `list_promotions` (incl. product discounts by default; paginate with `cursor`) |
| "¿Qué promociones tiene el producto X?" | `list_product_promotions` + `product_id` or `name` |
| "Detalle de la promo 2×1" / "¿cómo funciona la promo X?" | `get_promotion` + `promotion_id` or `name` |

### Step 2: Prefer the Smallest Read

1. **Default:** answer from conversation history and prior tool results if accurate.
2. **Text lookup:** `search_products` when the owner names or describes items.
3. **Full catalog / counts:** `list_products` with pagination — never guess totals.
4. **Single record:** `get_product` when you already have a UUID.

### Step 2b: Handle "Product Not Found" (typos + other languages)

`search_products` is fuzzy and accent-insensitive, so typos usually still match
("wins" → "WINGS & FRIES", "limon" → "Limón"). Two cases need extra care:

- **Suggestions returned:** if `products` is empty but `suggestions` is not, do **not**
  say "no existe". Offer the closest names: "No encontré 'X' exacto. ¿Te refieres a
  **WINGS & FRIES**?" and proceed if the owner confirms.
- **Another language / synonym:** fuzzy matching cannot bridge languages
  ("alitas" → "wings", "papas" → "fries", "refresco" → "soda"). When
  `search_products` returns **0 products and 0 suggestions**, fall back to
  `list_products` to load the catalog, then **you** map the term by translating /
  interpreting it against the real product names. Never declare a product missing
  until you have scanned the catalog this way.

### Step 3: Paginate Large Result Sets

When `list_products` returns `has_more: true`:

- Tell the owner you are showing one page.
- Call again with `cursor` from the previous response if they need more.
- Default `limit` is 20 (max 50).

### Step 4: Respond in Spanish

Reply to the owner in **Spanish markdown**. Format prices for humans (e.g. `$120.00 MXN`
from `price_cents`). Never dump raw tool JSON keys or snake_case field names in the reply.

---

## Tool Reference

### `list_categories`

| | |
|---|---|
| **Args** | `{}` (none) |
| **Returns** | Active categories: `id`, `name`, `description`, `sort_index` (menu order, lower = first), `is_active` |
| **Use when** | Owner needs category names/ids before filtering products |

### `list_products`

| Arg | Required | Meaning |
|-----|----------|---------|
| `category_id` | no | UUID of one category; omit for all categories |
| `cursor` | no | From previous `list_products` response |
| `limit` | no | Page size (default 20, max 50) |

**Returns:** `products[]`, `next_cursor`, `has_more`, `limit`, optional `category_id`

**Use when:** Full browse, "how many products", or all items in one category.

### `search_products`

| Arg | Required | Meaning |
|-----|----------|---------|
| `query` | yes | Fuzzy, accent-insensitive match on name + description |

**Returns:**

| Field | Meaning |
|-------|---------|
| `products` | Up to 20 confident matches, ranked, each with `match_score` (0–1) |
| `suggestions` | Up to 5 near-misses (lower score) for "did you mean" prompts |
| `query` | Echo of the searched term |

Matching tolerates typos and accents ("wins" → "WINGS & FRIES", "limon" → "Limón").
It does **not** cross languages — see Step 2b for the `list_products` fallback.

**Use when:** Named item lookup ("pastor", "limonada"), not full catalog export.

### `get_product`

| Arg | Required | Meaning |
|-----|----------|---------|
| `product_id` | one of | Product UUID (preferred when known from a prior result) |
| `name` | one of | Product name; resolved by fuzzy match when you have no UUID |

Provide **at least one**. If `product_id` is invalid/unknown and `name` is given, it
retries by name. On a name miss it returns `suggestions` (same shape as
`search_products`) instead of a hard failure.

**Returns:** One product with `option_groups`, prices, flags, **plus `promotions[]` and
`has_promotions`** for that product (or `suggestions` on a miss).

`get_product` already attaches the product's promotions (product/category/order scope,
including product discounts), so a single call answers "¿qué es y qué promos tiene?".
Use `list_product_promotions` only when you have the product elsewhere and want promos
alone.

**Use when:** Detail view, or confirming a single item from search/list.

### `list_promotions`

| Arg | Required | Meaning |
|-----|----------|---------|
| `effective_only` | no | `true` = only promos active right now (passes schedule). Default `false`. |
| `type` | no | Filter: `bundle` (2×1/NxM), `percent`, `amount`, `combo`. |
| `scope` | no | Filter: `product`, `category`, `order`. |
| `include_catalog` | no | **Default `true`** — product discounts (percent/amount set in the product editor) are included. Set `false` only to hide them and show marketing campaigns alone. |
| `cursor` | no | From a previous `list_promotions` response. |
| `limit` | no | Page size (default 20, max 50). |

**Returns:** `promotions[]`, `next_cursor`, `has_more`, `limit`.

**Use when:** Browsing/counting promotions, or filtering "¿qué promos están activas hoy?".

> **Important:** "Promotions" includes BOTH marketing campaigns (2×1/NxM, banners) AND
> per-product discounts (percent/amount). The latter have `is_catalog_discount=true`.
> When the owner asks "¿qué promociones tengo?", report **both kinds** — a product can
> carry a discount *and* a 2×1 at the same time. Do not list only the bundles.

### `list_product_promotions`

| Arg | Required | Meaning |
|-----|----------|---------|
| `product_id` | one of | Product UUID (preferred when known). |
| `name` | one of | Product name; resolved by fuzzy match when you have no UUID. |
| `effective_only` | no | Only promos active right now (default false). |

**Returns:** `product` (`id`, `name`, `price_cents`) + `promotions[]`, where each promo also
carries `applies_via` (`product`, `category`, or `order`).

**Use when:** "¿qué promociones tiene BURGER & BONELESS?" or any single-product promo
question. This is the reliable way to surface a product that has **both** a discount and a
bundle, because it gathers product-, category-, and order-scoped promos in one call.

### `get_promotion`

| Arg | Required | Meaning |
|-----|----------|---------|
| `promotion_id` | one of | Promotion UUID (preferred when known from a prior `list_promotions`). |
| `name` | one of | Promotion name; resolved by fuzzy match when you have no UUID. |

Provide **at least one**. On a name miss it returns `suggestions` instead of a hard failure.

**Returns:** One promotion with resolved product/category names, schedule, and `pricing_note`.

**Use when:** Explaining one promo in depth or before referencing its products.

---

## Promotion Payload Fields

Each promotion includes:

| Field | Meaning |
|-------|---------|
| `id` | Promotion UUID |
| `name` | Owner-facing name (internal `__product_discount__` prefix is stripped) |
| `type` | `bundle` (stored as `two_for_one`), `percent`, `amount`, `combo` |
| `scope` | `product`, `category`, or `order` |
| `label` | Short badge: `2×1`, `-15%`, `-$20.00`, `Combo` |
| `effective_status` | `active`, `scheduled`, `expired`, `outside_schedule`, `inactive` |
| `is_catalog_discount` | `true` = auto discount from the product editor |
| `priced_in_cart` | `false` only for `combo` (visual badge, no checkout math) |
| `percent` / `amount_cents` | Discount value (by type) |
| `bundle` | `{ get_quantity, pay_quantity, pairing_mode }` for NxM |
| `min_order_cents` | Minimum order for `scope=order` promos |
| `campaign` | `starts_at` / `ends_at` window |
| `schedule` | Weekdays + daily time window when restricted |
| `products` / `categories` | Resolved targets with `id` + `name` |
| `option_item_ids` | Raw ids from `promotion_option_items`. Bundle = **allow-list** of eligible add-ons; percent/amount = **waived** add-ons. Empty = no restriction |
| `applies_via` | Product-context only (`get_product` / `list_product_promotions`): how it reaches the product (`product`, `category`, `order`) |
| `option_participation` | Product-context only: which of THIS product's add-ons participate. See below |
| `pricing_note` | Plain-language summary of how it affects the total |

### `option_participation` (add-ons in/out of the promo)

Present only in product-context results (`get_product.promotions[]` and
`list_product_promotions`), because it is computed against the product's own add-ons.

Source of truth in the DB: the **`promotion_option_items`** table
(`promotion_id` ↔ `option_item_id`), exposed as `option_item_ids`.

For a **bundle / NxM** (`semantics: "bundle_allow_list"`):

| `mode` | Meaning |
|--------|---------|
| `all_participate` | `option_item_ids` is empty → every add-on participates |
| `restricted` | `participating[]` = eligible add-ons; `not_participating[]` = add-ons that, if chosen, **remove that unit from the 2×1** (it pays full price) |

For **percent / amount** (`semantics: "waived"`): `free_complements[]` are not charged
under the promo; `charged_complements[]` are billed normally.

Each add-on entry is `{ id, label, group_title }`. Use `not_participating` /
`charged_complements` to tell the owner exactly which complementos quedan fuera.

**Key meanings (see `docs/promociones-referencia.en.md`):**

- **`bundle` / 2×1:** `get_quantity` units, pay `pay_quantity`. The cheapest base
  prices become free; **paid add-ons are always charged**. `same_product` = both units
  must be the same SKU; `cross_product` = mix from the promo pool.
- **Add-ons that don't participate in a bundle:** a bundle may restrict which add-ons
  are eligible via `promotion_option_items` (DB) → `option_item_ids` (payload). It is an
  **allow-list**: if it is empty, **every** add-on participates; if it has ids, any
  add-on **not** in it does **not** participate, and picking one **drops that unit from
  the NxM** (it pays full price). See `option_participation` below.
- **`percent` / `amount`:** discount on the affected line subtotal (or whole order when
  `scope=order`). Line promos don't stack — the cheapest outcome wins.
- **`combo`:** label only; it does **not** change the cart total.
- **Product discounts (`is_catalog_discount=true`):** percent/amount set in the product
  editor. They ARE promotions and appear in `list_promotions` by default — always count
  them. A single product can have a product discount **and** a bundle simultaneously.
- Final pricing is computed at checkout (`/cart/quote`), not by this skill. Describe
  promos and their effect, but never assert a computed cart total.

Never invent values missing from tool results.

---

## Product Payload Fields

Each product includes (see `docs/live-menu-product-reference.en.md`):

| Field | Meaning |
|-------|---------|
| `id` | Stable UUID. Use it for `get_product` and cart/order references |
| `name`, `description` | Display text (`description` may be `null`) |
| `image_path` | Storage object path (not a full URL); `null` if no photo |
| `price_cents`, `currency` | **Base** unit price in cents. Format as `price_cents / 100` (e.g. `12000` → `$120.00 MXN`) |
| `is_active` | Soft-delete flag. `false` = unavailable; live menu disables "Add to cart" |
| `is_published`, `approval_status` | Publish workflow. Live menu shows only `is_published=true` + `approval_status="approved"` |
| `category_ids` | Categories the product belongs to |
| `category_sort_indices` | `{ category_id → sort_index }`; display order **within** each category (lower = first) |
| `has_options` | `true` when the product has at least one option group |
| `option_groups` | Modifier groups (size, extras…), already **sorted by `sort_index`** |
| `has_promotions` | *(`get_product` only)* `true` when the product has ≥1 promotion |
| `promotions` | *(`get_product` only)* Promotions affecting it, each with `applies_via` + `pricing_note` |

### `price_cents` is the base price — not the promo price

`price_cents` is always the catalog base price. It does **not** include any
percent/amount/bundle discount. To talk about discounted prices, read promotions via
`list_promotions` / `get_promotion` and explain that the final price is computed at
checkout. Never present `price_cents` as "the price with promo applied".

### Option group fields

| Field | Meaning |
|-------|---------|
| `id` | Group UUID (key used in customer selections) |
| `title` | Section heading (e.g. "Tamaño", "Extras") |
| `required` | Customer must satisfy the rule before adding to cart |
| `selection` | `single` = at most one item; `multi` = several items |
| `min_selections` / `max_selections` | Bounds for `multi` (`max_selections=null` = no limit). Ignored for `single` |
| `sort_index` | Display order among groups (lower = first; already sorted) |
| `is_active` | `false` groups are **hidden** on the live menu |
| `selection_summary` | Ready-to-read Spanish rule (e.g. "Elige entre 1 y 2 · Obligatorio") |
| `items` | Choices inside the group, sorted by `sort_index` |

### Option item fields

| Field | Meaning |
|-------|---------|
| `id` | Item UUID (stored in cart `selected_options`) |
| `label` | Customer-facing name (e.g. "Grande", "Queso extra") |
| `price_delta_cents` | Cents **added to the unit price** when selected (can be `0`) |
| `sort_index` | Display order within the group |
| `is_active` | `false` items are **hidden** on the live menu |

### How a line total is built (read-only mental model)

```
options_total_cents = Σ price_delta_cents of selected active items
unit_price_cents    = price_cents + options_total_cents
line_subtotal_cents = unit_price_cents × quantity
```

Options are **always additive** on top of the base price. Promotions (bundle/percent/
amount/order) are applied **after** this, by the checkout quote — not by this skill.
When `is_active=false` on a group or item, treat it as unavailable.

Never invent values missing from tool results.

---

## Example Workflows

### "¿Cuántos productos tengo en total?"

1. Call `list_products` with `{}`, note `products.length` and `has_more`.
2. If `has_more`, paginate with `cursor` until `has_more` is false; sum counts.
3. Answer: total active products listed across pages.

### "Muéstrame los productos de Bebidas"

1. `list_categories` → find Bebidas `id` (or use id if owner gave it).
2. `list_products` with `{ "category_id": "<uuid>" }`.
3. If `has_more`, offer next page or fetch with `cursor`.

### "Muéstrame detalles de ambos" (reuse prior results — do NOT re-search blindly)

`search_products` and `list_products` already return **full payloads** (price,
`option_groups`, flags). When the owner asks for details of items you just listed:

1. **First, reuse** the products already in this turn's tool results — you usually have
   everything (including `id`). Just reformat; no new tool call needed.
2. If you must re-fetch, call `get_product` **once per product**, preferring the `id`
   from the earlier result: `{ "product_id": "<uuid>" }`.
3. If you only have names, call `get_product` `{ "name": "BURGER & BONELESS" }` — it
   resolves by fuzzy match. Never pass a name into `product_id`.
4. Never reply "Product not found" for items you already retrieved moments ago.

### "¿Cuánto cuesta el taco al pastor?" / "háblame de X"

1. Prefer `search_products` `{ "query": "pastor" }`; if you need full detail use
   `get_product`.
2. If multiple matches, clarify or list options.
3. Format `price_cents` in Spanish for the owner.
4. **Always mention promotions:** `get_product` returns `promotions` / `has_promotions`.
   If the product has any (a discount, a 2×1, etc.), state them with their
   `label`/`pricing_note` — e.g. "BURGER & BONELESS: $259.00, con descuento −$59.00 y
   además 2×1". If `has_promotions` is false, say it has no active promos.

### "¿Tienes alitas con papas?" (other language / synonym)

1. `search_products` `{ "query": "alitas con papas" }` → 0 products, 0 suggestions.
2. Fall back to `list_products` (paginate if needed) to load the catalog.
3. Map "alitas con papas" → **WINGS & FRIES** by interpreting the names yourself.
4. Answer in Spanish with that product (price, option groups). Do not say it is missing.

### "Busca wins and fries" (typo)

1. `search_products` `{ "query": "wins and fries" }` → fuzzy match returns **WINGS & FRIES**.
2. If it lands in `suggestions` instead of `products`, confirm: "¿Te refieres a WINGS & FRIES?"

### "¿Qué opciones tiene la hamburguesa?" (modifiers)

1. Get the product (reuse a prior result or `get_product` by `id`/`name`).
2. For each active `option_group`, read `selection_summary` (e.g. "Elige hasta 2 ·
   Obligatorio") and list active `items` with their `price_delta_cents`
   ("Queso extra +$15.00").
3. Skip groups/items with `is_active=false` (hidden on the live menu).
4. Remember `price_delta_cents` is **added** to the base `price_cents` per unit.

### "¿Qué promociones tengo?" / "¿qué promos activas?"

1. `list_promotions` (add `{ "effective_only": true }` for "activas ahora").
2. Report **every** promo, both kinds:
   - Marketing: 2×1/NxM, percent/amount campaigns (`is_catalog_discount=false`).
   - Product discounts: `is_catalog_discount=true` → "Descuento en {producto}".
3. Use `label` + `pricing_note` for each (e.g. "2×1 en WINGS"; "−$59.00 en BURGER &
   BONELESS"). Never report only the bundles.
4. If `has_more`, offer the next page with `cursor`.

### "¿Qué promociones tiene BURGER & BONELESS?" (a product with several promos)

1. `list_product_promotions` `{ "name": "BURGER & BONELESS" }` (or `product_id`).
2. The result lists **all** of them — e.g. an `amount` product discount ($259 → $200)
   **and** a `2×1` bundle. Explain each with its `label`/`pricing_note` and note
   `applies_via` (`product`, `category`, or `order`).
3. Do not stop at the first promo; a product commonly stacks a discount with a bundle.

### "¿Cómo funciona la promo 2×1 de alitas?"

1. `get_promotion` `{ "name": "2x1 alitas" }` (or `promotion_id` if you have it from a
   prior `list_promotions`).
2. Read `bundle`, `pairing_mode`, `products`, `schedule` and explain with `pricing_note`:
   which products, how many free, whether add-ons are charged, and when it's valid.
3. If it returns `suggestions`, confirm the right promo with the owner.

### "¿Qué complementos no entran en el 2×1 de WINGS?"

1. `get_product` `{ "name": "WINGS" }` (or `list_product_promotions`).
2. Find the bundle promo and read `option_participation`:
   - `mode = "all_participate"` → "Todos los complementos participan en el 2×1".
   - `mode = "restricted"` → list `not_participating[]` by `label` and warn that choosing
     one of those saca esa unidad del 2×1 (paga precio completo).
3. Add-ons are charged anyway in a bundle; the allow-list only controls **eligibility**.

### "¿Cuántos productos (no) tienen promociones?" (aggregate — be careful)

`list_products` does **not** tell you which products have promos. To answer correctly:

1. `list_products` (paginate until `has_more=false`) → the full set of product `id`/name.
2. `list_promotions` (default includes product discounts) → for each promo collect its
   `product_ids`; for `scope=category` promos, expand via the products in those
   `category_ids`; treat `scope=order` as affecting all products.
3. A product "has a promotion" if it appears in any of those sets. Count the complement.
4. If unsure (e.g. many promos/products), say what you counted and how. **Never** claim a
   per-product `has_promotions` value that you did not actually fetch — that field only
   exists in `get_product` / `list_product_promotions`, not in `list_products`.

### "¿En qué productos aplica mi descuento del 15%?"

1. `list_promotions` `{ "type": "percent" }` to find the promo, then `get_promotion`
   for the full target list (or read `products`/`categories` directly from the list item).
2. Resolve target names from `products` / `categories`; answer in Spanish.

---

## Rules (Do / Don't)

| Do | Don't |
|----|-------|
| Use tools for live DB data when context is insufficient | Invent prices, counts, or categories |
| Paginate with `list_products` for large menus | Assume `search_products` returns the full catalog |
| Scope every call to the current restaurant tenant | Reference other restaurants |
| Say when data is partial (page 1 of N) | Claim you edited or disabled products |
| Use `get_product` for one known UUID | Call tools "just in case" when prior results already suffice |
| Explain promos with `label` + `pricing_note` | Compute or assert a final cart total (checkout owns that) |
| Use `effective_only` for "active now" questions | Treat `combo` as a real discount |
| Read promos from `get_product` / `list_product_promotions` / `list_promotions` | Claim `has_promotions` per product from `list_products` (it has none) |
| Cross-reference `list_promotions` ids for "how many products have promos" | Invent per-product promo coverage you never fetched |

---

## Pre-Response Checklist

Before your final reply to the owner (after any tool calls):

- [ ] Numbers (counts, prices) come from tool results, not guesses
- [ ] Pagination state explained if `has_more` was true
- [ ] Inactive/unpublished products noted when relevant
- [ ] Promotion claims come from `get_product` / `list_product_promotions` /
      `list_promotions` — NOT inferred from `list_products` (which has no promo data)
- [ ] Aggregate "X products have/don't have promos" was actually computed by
      cross-referencing `list_promotions` ids, not assumed
- [ ] Reply is Spanish markdown for the restaurant owner — no raw JSON keys in the message
- [ ] No delete/mutate actions — this skill is read-only
