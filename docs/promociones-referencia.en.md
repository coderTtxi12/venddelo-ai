# Promotions — read-only reference

Concise overview: promotion types, where the live menu reads them, which tables are involved, and how they affect the cart total.

> **Pricing source of truth:** backend `price_cart()` (`backend/app/modules/promotions/pricing.py`).  
> The public menu **displays** promotions; the **final calculation** happens at `POST /public/restaurants/{subdomain}/cart/quote`.

---

## 1. Promotion types

| API / UI type | DB type (`promotions.type`) | Priced in cart? | Typical source |
|---------------|----------------------------|-----------------|----------------|
| **NxM / bundle / 2×1** | `two_for_one` | Yes | Marketing (`/marketing`) |
| **Percent** | `percent` | Yes | Marketing or catalog discount |
| **Fixed amount** | `amount` | Yes | Marketing or catalog discount |
| **Combo** | `combo` | **No** (menu badge only) | Marketing (legacy) |
| **Catalog discount** | `percent` or `amount` | Yes | Product editor (Products) |

**Aliases:** the API exposes `bundle` / `2x1`; Postgres stores `two_for_one`.

### Scope (`scope`)

| `scope` | Meaning | Allowed types |
|---------|---------|---------------|
| `product` | Applies to products linked in `promotion_products` | percent, amount, combo, two_for_one |
| `category` | Applies to products in categories in `promotion_categories` (optional: filter via `product_ids`) | percent, amount, combo, two_for_one |
| `order` | Discount on the full order subtotal | percent, amount |

---

## 2. Tables and fields (Postgres)

### `promotions`

| Field | Meaning |
|-------|---------|
| `id` | Promotion UUID |
| `restaurant_id` | Owning restaurant |
| `name` | Display name. Catalog discounts use prefix `__product_discount__` + product name |
| `type` | `percent`, `amount`, `combo`, `two_for_one` |
| `scope` | `product`, `category`, `order` |
| `percent` | 1–100 (only when `type = percent`) |
| `amount_cents` | Fixed discount in cents (only when `type = amount`) |
| `min_order_cents` | Minimum order for `order`-scope promos |
| `bundle_get_quantity` | **N** in N×M (e.g. 2 in 2×1) |
| `bundle_pay_quantity` | **M** units the customer pays (e.g. 1 in 2×1). Must be `< get_quantity` |
| `bundle_pairing_mode` | `cross_product` (mix products) or `same_product` (same SKU only) |
| `image_path` | Banner image on public menu (marketing) |
| `starts_at` / `ends_at` | Campaign validity window |
| `recurrence_weekdays` | Days 0=Mon … 6=Sun; empty = every day |
| `recurrence_start_time` / `recurrence_end_time` | Daily time window (restaurant timezone) |
| `is_active` / `deleted_at` | Active / soft delete |

### Junction tables

| Table | Purpose |
|-------|---------|
| `promotion_products` | Participating products (`promotion_id`, `product_id`) |
| `promotion_categories` | Participating categories (`promotion_id`, `category_id`) |
| `promotion_option_items` | Allowed add-ons for bundles; waived add-ons for percent/amount |

### Order persistence (snapshot at checkout)

| Table | Relevant fields |
|-------|-----------------|
| `orders` | `subtotal_before_discount_cents`, `discount_cents`, `applied_order_promotion_id`, `applied_order_discounts` (JSONB) |
| `order_items` | `line_subtotal_cents`, `discount_cents`, `line_total_cents`, `applied_promotion_id`, `applied_discounts` (JSONB) |

### Menu config (`restaurants`)

| Field | Purpose |
|-------|---------|
| `timezone` | Evaluates whether a promo is effective now |
| `digital_menu_promotions_category_*` | Virtual “Promotions” section |
| `digital_menu_limited_time_category_*` | “Limited time” section (discounted products) |

---

## 3. Live menu — how a 2×1 promotion is read

### Data flow

```
PublicDigitalMenuPage
  → GET /public/restaurants/{subdomain}/promotions   (effective promos + server_now)
  → GET /public/menu/{subdomain}                     (products, categories, prices)
  → local cache: venddelo:public-promotions:{subdomain}
```

**Key frontend files:**
- `frontend/src/components/pages/PublicDigitalMenuPage.tsx` — initial load
- `frontend/src/lib/promotions/publicPromotionsCache.ts` — cache
- `frontend/src/lib/promotions/promotionShortcuts.ts` — N×M banners
- `frontend/src/lib/promotions/menuProductDiscount.ts` — badges on product cards

### What “2×1” means on screen

A `two_for_one` promo with `bundle_get_quantity = 2` and `bundle_pay_quantity = 1`:

- Customer **gets 2 units** and **pays for 1**.
- Menu badge: `2×1` (format `{get}×{pay}`).
- Typical slogan: “Buy 2, pay 1”.
- **Only the base price** can be free; **paid add-ons are always charged**.
- With `bundle_pairing_mode = same_product`: both units must be **the same product**.
- With `cross_product`: different products from the promo pool may be mixed.

### Banners vs cards

| Element | Conditions | Data used |
|---------|------------|-----------|
| **Shortcut banner** | Not a catalog discount, not `scope=order`, has `image_path`, effective, ≥1 product | `name`, `image_path`, `bundle`, schedule |
| **Product badge** | Product participates in an effective promo | `type`, `percent`, `amount`, `bundle` |

Banners **do not compute price**; tapping them lists participating products (`PromotionShortcutProductsView`).

### Effectiveness (“is it active now?”)

Backend: `is_promotion_effective()` — `backend/app/modules/promotions/effective.py`

Must pass: `is_active`, `starts_at`/`ends_at` window, weekday, and recurring time (in restaurant timezone).

---

## 4. Total calculation — N×M (2×1) promotion

Engine: `price_cart()` in `backend/app/modules/promotions/pricing.py`.

### Step by step (bundle)

1. Filter **effective** promos with `type = two_for_one` and product/category `scope`.
2. Expand the cart into **units** (quantity × lines).
3. Each unit contributes `base_cents` (product base price, including catalog discount if any) + `options_cents` (add-ons).
4. Only units that satisfy add-on rules (`promotion_option_items`) enter the bundle pool.
5. **Pairing** (`_allocate_cross_bundle_free_bases`):
   - Sort bases from lowest to highest price.
   - **2×1:** pair cheapest with most expensive (alternating ends).
   - **General N×M:** groups of `get_quantity`; the `get_quantity - pay_quantity` cheapest in each group are free.
6. If multiple bundle promos apply, the one with the **lowest cart total** wins.
7. `line_total = (charged bases + all add-ons) × units`.

### Per-line formula (summary)

```
line_subtotal_without_promo = (base_price + add_ons) × quantity
bundle_discount             = sum of free bases from pairing
line_total                  = line_subtotal_without_promo - bundle_discount
```

Add-ons are **never** discounted in a bundle.

### Quote API

```
POST /public/restaurants/{subdomain}/cart/quote
```

Frontend: `useCheckoutCartQuote.ts` → breakdown in `buildCheckoutLineBreakdown.ts` → UI in `PublicMenuCheckoutSummary.tsx`.

---

## 5. Product discounts (percent / fixed amount)

**Two origins** share the same DB types but serve different purposes:

### A) Catalog discount (on product create/edit)

**Not stored on `products`.** Saved as a row in `promotions`:

| Rule | Value |
|------|-------|
| `name` | `__product_discount__` + product name |
| `scope` | `product` |
| `type` | `percent` or `amount` |
| `promotion_products` | Exactly 1 product |

**Write path:** `syncProductCatalogDiscount()` — `frontend/src/lib/promotions/productCatalogDiscount.ts`  
(on product save in `supplierProducts.ts`).

**Read path on live menu:**
- Public promotions API (same list as marketing bundles).
- `buildMenuProductDiscountMap()` — `-X%` badge or strikethrough price.
- `buildProductCatalogDiscountMapFromPromotions()` — product → discount USD map (admin).

**Backend identification:**
```python
_is_catalog_discount_promo(promo, product_id)
# scope=product, type in (percent, amount), name.startswith("__product_discount__")
```

### B) Manual percent/amount promotion (Marketing)

Same `promotions` table, but:
- `name` **without** `__product_discount__` prefix
- May use `scope=product`, `category`, or `order`
- Requires `image_path` for banners (catalog exempt)

---

## 6. Total calculation — percent and amount

### On product line (`scope = product | category`)

**Line subtotal:**
```
line_subtotal = (base_price + chargeable_add_ons) × quantity
```

**Percent:**
```
discount = round(line_subtotal × percent / 100)
line_total = line_subtotal - discount
```

**Fixed amount (product):**
```
discount = min(amount_cents × quantity, line_subtotal)
line_total = line_subtotal - discount
```

**Waived add-ons:** if the promo defines `promotion_option_items`, those extras **are excluded** from the subtotal before discount (they are “free”).

**Catalog vs line promo:** for the same unit, the engine picks the **cheapest** outcome for the customer (line promos do not stack).

### Catalog discount (base only)

Before bundles or other line promos, the base may be reduced:

```python
# percent
discounted_base = round(base_price × (100 - percent) / 100)

# amount
discounted_base = max(0, base_price - amount_cents)
```

That discounted base is what N×M pairing uses.

### On full order (`scope = order`)

After summing all lines:

```
lines_subtotal = Σ line_total per line

# percent
order_discount = round(lines_subtotal × percent / 100)

# amount
order_discount = min(amount_cents, lines_subtotal)

total = lines_subtotal - order_discount
```

Only applies if `lines_subtotal >= min_order_cents`. **One** order promo wins (highest discount).

---

## 7. Pricing pipeline (visual summary)

```
Cart (products + quantities + add-ons)
        │
        ▼
Effective N×M bundle promo? ──► pair units, free bases
        │
        ▼
Line percent/amount promo? ──► discount on line subtotal
        │                         (vs best bundle: cheapest wins)
        ▼
Catalog discount on base? ──► reduce base before bundle
        │
        ▼
lines_subtotal = sum of lines
        │
        ▼
Order percent/amount promo? ──► discount on order
        │
        ▼
total_cents
```

---

## 8. What the live menu does not do (important)

| Behavior | Detail |
|----------|--------|
| Cart bar subtotal | Local estimate; **not** the final total |
| `combo` type | “Combo” label only; **no** checkout math |
| Stack 2 line promos | No; best price wins |
| Stack 2 order promos | No; one wins |
| Catalog + bundle | Yes: catalog lowers base, then bundle pairs on that base |

---

## 9. File index

| Topic | Path |
|-------|------|
| DB model | `backend/app/db/models/promotions.py` |
| Pricing engine | `backend/app/modules/promotions/pricing.py` |
| Effectiveness | `backend/app/modules/promotions/effective.py` |
| Public API | `backend/app/modules/public/api.py` |
| Live menu | `frontend/src/components/pages/PublicDigitalMenuPage.tsx` |
| Catalog discount | `frontend/src/lib/promotions/productCatalogDiscount.ts` |
| Menu badges | `frontend/src/lib/promotions/menuProductDiscount.ts` |
| Checkout quote | `frontend/src/lib/digital-menu/cart/useCheckoutCartQuote.ts` |
| UI breakdown | `frontend/src/lib/digital-menu/cart/buildCheckoutLineBreakdown.ts` |
| Marketing (NxM) | `frontend/src/components/marketing/PromotionForm.tsx` |
