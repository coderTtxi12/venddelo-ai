---
name: promotions
description: Create and manage marketing promotions (2×1/NxM, combo badges, percent/amount campaigns). Generate AI promo banners. Guides owners step-by-step when adding a new marketing promo (secretary-style onboarding).
---

# promotions

Mutating access to **marketing promotions** for the current restaurant. Catalog product
discounts (auto-generated from the product editor) are out of scope — use the admin UI for
those.

**Never delete** — disable with `disable_promotion` when a campaign ends.

---

## When to use this skill

Use `promotions` when the owner asks to **create a promotion**, **adjust an NxM promo**, or **turn one off**:

- 2×1 / NxM bundles on specific products or categories
- Visual combo badges (`type: combo`)
- Percent or amount campaigns with a banner (not catalog discounts)
- Link products/categories at create time (include all targets in `create_promotion`)
- Add/remove products on an existing **NxM / 2×1** promo (`update_nxm_promotion`)
- Enable/disable complements on NxM promos (`update_nxm_promotion_complements`)
- Turn off an expired campaign

Use `menu_read` first (`list_promotions`, `get_promotion`, `get_product`) to inspect live
state before mutating.

For **recommendations** before creating a promo, call `load_skill(menu_best_practices)` first.

---

## Safety rules

1. **Read before write** — confirm product/category names and existing promos with `menu_read`.
2. **Banner required for marketing** — pass `image_path` from an uploaded asset when possible;
   otherwise the tool uses a placeholder (promo works but the Promociones aisle looks generic).
3. **NxM needs targets** — `scope` `product` or `category` plus at least one target.
4. **Prices in cents** — `amount_cents`, `min_order_cents` (100 MXN = 10000).

---

## Alta de promo de marketing (flujo secretaria)

When the owner wants to **create a new marketing promotion** — "crear una promo", "quiero un 2×1",
"poner descuento", "nueva promoción de marketing" — act as a **friendly secretary**: warm Spanish,
**one question per turn**, no technical jargon (no UUIDs, `amount_cents`, `scope`, `type` enums).

Catalog discounts from the product editor are **out of scope** — this flow is only for **marketing
campaigns** (2×1/NxM, % off with banner, fixed amount off, combo badge).

### Before you ask anything

1. **`load_skill(promotions)`** — if not already loaded this turn.
2. **`list_products`** and/or **`list_categories`** — you need real product/category names; never invent targets.
3. Optionally **`list_promotions`** — avoid duplicate names or overlapping campaigns.

### Step order (skip steps the owner already answered)

| Step | What you collect | How to ask (examples) |
|------|------------------|------------------------|
| 1 | **Tipo** | "¿Qué tipo de promo quieres? Por ejemplo: **2×1** (lleva 2 paga 1), **descuento en %**, **monto fijo** ($), o **badge de combo** (solo visual)." |
| 2 | **Nombre** | "¿Cómo quieres que se llame en Promociones? (ej. **2×1 Alitas**, **-15% Tacos**)" |
| 3 | **Alcance** | "¿Aplica a **productos** específicos, a toda una **categoría**, o al **pedido completo**?" |
| 4 | **Targets** | Show names from `list_products` / `list_categories`: "¿Cuáles productos entran?" / "¿En qué categoría?" |
| 5 | **Regla** | 2×1: confirm "lleva 2 paga 1" or other NxM. %: "¿Qué porcentaje?" Amount: "¿Cuántos pesos de descuento?" Combo badge: skip (visual only). Order scope: optional minimum ("¿Pedido mínimo?"). |
| 6 | **Fechas** (optional) | "¿Tiene fecha de inicio o fin, o la dejamos siempre activa?" |
| 7 | **Horario** (optional) | "¿Solo ciertos días u horario? (ej. fines de semana, happy hour)" |
| 8 | **Banner** (optional) | "¿Generamos un banner con IA o subes una imagen? Si no, usamos placeholder y luego `generate_promotion_banner`." |
| 9 | **Recap + confirm** | Short bullet recap in Spanish (tipo, nombre, productos/categoría, regla, fechas si hay); end with "¿La creamos así?" / "¿Confirmo?" |

Only after **explicit yes** on the recap → **`create_promotion`**.

### Secretary rules

- **One question per message** — do not dump a form with many fields at once.
- **Never call `create_promotion`** until type, name, scope, targets (when required), and discount rule are known **and** the owner confirmed the recap.
- If the owner gives everything in one message, still **recap and confirm** before mutating.
- Use **product_names** / **category_names** from `menu_read`; map to IDs only inside the tool call.
- Owner says pesos for fixed discounts → convert to `amount_cents` (×100) silently; never say "centavos" to them.
- **NxM / 2×1** requires `scope` `product` or `category` with at least one target — never create without targets.
- **`type: combo`** is visual only (no cart math) — say that plainly if they pick combo badge.
- Mention placeholder banner if they skip image; offer **`generate_promotion_banner`** after create.

### Example dialogue (2×1)

```
Owner: Quiero crear una promo de 2×1
You:  [list_products] Claro. ¿A qué productos aplica el 2×1? Hoy tienes: WINGS & FRIES, BONELESS, Taco al pastor…

Owner: WINGS & FRIES
You:  ¿Cómo quieres que se llame la promo en Promociones?

Owner: 2×1 Alitas
You:  Quedaría así:
      - **2×1 Alitas** — lleva 2, paga 1
      - Producto: **WINGS & FRIES**
      - Banner: placeholder (podemos cambiar la imagen después)
      ¿La creamos así?

Owner: Sí
You:  [create_promotion] Listo, ya está tu promo de marketing.
```

### After create (optional)

- **Banner:** `generate_promotion_banner` (AI, 16:9 delivery-style creative).
- **NxM products:** `update_nxm_promotion` to add/remove products without replacing the full list.
- **NxM complements:** `update_nxm_promotion_complements` to exclude or re-include add-ons.
- **End campaign:** `disable_promotion` when it expires — never hard-delete.

Other edits (dates, rules, non-NxM promos) are done in the **admin UI**.

---

## Available tools

| Tool | Purpose |
|------|---------|
| `create_promotion` | New marketing promo after secretary recap confirmed (name, type, scope, targets, optional schedule/dates) |
| `update_nxm_promotion` | Incrementally add/remove products on an existing NxM / 2×1 promo |
| `update_nxm_promotion_complements` | Enable or disable complements on an NxM allow-list |
| `disable_promotion` | Soft-disable (`is_active=false`) by `promotion_id` or name |
| `generate_promotion_banner` | AI 16:9 marketing banner → storage → sets `image_path` on one promo |

### Types (`type`)

| Value | Meaning |
|-------|---------|
| `bundle` / `2x1` | NxM — default 2×1; override with `bundle.get_quantity` / `pay_quantity` |
| `combo` | Visual badge only; no cart discount |
| `percent` | Percent off affected subtotal |
| `amount` | Fixed amount off affected subtotal |

### Scopes (`scope`)

| Value | Targets |
|-------|---------|
| `product` | `product_ids` or `product_names` |
| `category` | `category_ids` or `category_names` |
| `order` | Whole order; optional `min_order_cents` |

---

## Typical flow

```
Owner: "Crea un 2×1 de WINGS & FRIES"
  → menu_read: get_product / search_products (confirm product)
  → promotions: create_promotion {
       name: "2×1 Alitas",
       type: "bundle",
       scope: "product",
       product_names: ["WINGS & FRIES"]
     }
  → Confirm in plain Spanish what was created
```

---

## Reply style

- Confirm promo name, type label (2×1, -15%, etc.), and which products/categories participate.
- Mention if a placeholder banner was used and offer **`generate_promotion_banner`** or a manual upload.
- Never dump raw UUIDs unless the owner asked for IDs.

---

## During menu_import concierge

When the owner is in an active `menu_import` session and `apply_full_import` just completed,
**auto-generate banners** for every live promo with `type: two_for_one` using
`generate_promotion_banner` (`confirmed: true`) — do not ask unless generation fails.
Do not generate product food photos during import.
