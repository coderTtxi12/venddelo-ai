from __future__ import annotations

import json
from typing import Any


def build_extraction_prompt(context: dict[str, Any]) -> str:
    """English system prompt for literal menu OCR / text extraction."""
    discovery = context.get("discovery_answers") or {}
    clarifications = context.get("clarification_answers") or {}
    currency = discovery.get("currency") or context.get("currency") or "MXN"
    cuisine = discovery.get("cuisine_type") or discovery.get("cuisine") or ""

    context_block = ""
    if discovery or clarifications:
        context_block = (
            "\n\nOwner-provided context (use for currency, schedule hints, naming — "
            "do NOT invent items not visible in the source):\n"
            f"{json.dumps({'discovery': discovery, 'clarifications': clarifications}, ensure_ascii=False, indent=2)}"
        )

    cuisine_line = f"\nRestaurant cuisine hint: {cuisine}." if cuisine else ""

    return f"""You are a menu OCR extraction engine. Transcribe ONLY what is visible in the menu source.
Default currency: {currency}.{cuisine_line}{context_block}

Important:
- Source text is usually **Mexican Spanish** ({currency}, MXN pricing).
- **Complement/add-on blocks are often separate** from the product list (e.g. a shared "Sabores", "Adicionales", or "Guarniciones" section on another column/page).
- **Attach `option_groups` to each product** when the menu gives enough signal:
  - Section headers or footnotes that name the product(s) a block applies to
  - Product descriptions ("incluye salsa", "elige tamaño", "hasta 2 sabores")
  - Tables where rows/columns link a product variant to a choice list
- Reuse the **same complement labels** across products when the menu shows signals that the same addons are available for multiple products; do not duplicate items under every product unless the menu shows signals that the same addon is available for different products.
- If a shared add-on block clearly applies to some products but not others, attach groups only to those products.

**Goal — self-service digital menu:**
Build a draft so complete and unambiguous that an end customer can order without calling the restaurant.
- Capture every rule the printed menu states: required choices, limits ("hasta 2 sabores"), extras pricing, promos, schedules.
- Structure beats prose: use `option_groups` + min/max instead of burying rules only in `description`.
- Keep `description` and `constraints_notes` short and factual — what the customer needs to decide, not marketing fluff.
- When the menu is silent or ambiguous (e.g. global extras vs product-specific) → `open_questions` in Spanish for the owner; never guess.

Rules:
- Transcribe literally; never invent categories, products, descriptions, prices, promotions, etc.
- **Prices in pesos MXN ({currency}) as printed on the menu** — use `price_mxn` / `price_delta_mxn` /
  `amount_mxn` as whole pesos or decimals (e.g. $229 → 229, $85.50 → 85.5). **Never use centavos.**
  If a price is missing or illegible, use `null` and add an open_question for the missing price.
- Complement items without an extra charge use `price_delta_mxn: null` or `0`.
- Assign stable refs: cat_1, prod_1, og_1, oi_1, promo_1 (unique within this extraction).
- Preserve product availability as is_available=true unless explicitly marked unavailable.
- **Product catalog discounts** (strikethrough, "-15%", "-$20", "precio especial" on one item):
  set `catalog_discount` on the product — NOT in `promotions`.
  - percent → `{{"type": "percent", "percent": 15, "label": "-15%"}}`
  - fixed amount off → `{{"type": "amount", "amount_mxn": 20, "label": "-$20"}}`
  - omit `catalog_discount` when there is no per-product discount on the menu.
- **Complement groups (option_groups)** — infer from menu:
  - If required vs optional is unclear → open_questions (do not guess)
  - option_groups.selection is "single" or "multi"; min_selections/max_selections must match required flag.
- **Marketing promotions** go in `promotions` (NOT catalog_discount):
  - NxM / 2×1 / 3×2 → type=two_for_one, bundle={{get_quantity, pay_quantity, pairing_mode}},
    target_product_refs, eligible_option_item_refs (oi_* refs that participate; empty = none)
  - percent/amount campaigns with banner wording → type percent/amount, scope product/category/order
  - combo → type combo

Return a single JSON object with this shape (// = field meaning):
{{
  "categories": [{{
    "ref": "cat_1",                    // stable id: cat_*
    "name": "string",                  // section title as printed
    "description": "string | null",    // category blurb; null if absent
    "sort_order": 0,                   // display order, 0-based
    "products": [{{
      "ref": "prod_1",                 // stable id: prod_*
      "name": "string",                // dish name as printed
      "description": "string | null",  // description/subtitle/ingredients; null if absent
      "price_mxn": 0,                  // base price in pesos; null if unknown
      "currency": "{currency}",        // usually MXN
      "is_available": true,            // false only if marked unavailable
      "catalog_discount": null,        // null, or {type, percent?, amount_mxn?, label?} for item-level discount
      "option_groups": [{{
        "ref": "og_1",                 // stable id: og_*
        "title": "string",             // group label (Tamaño, Salsa, Extras…)
        "selection": "single | multi", // one choice vs several
        "required": false,             // customer must pick from this group
        "min_selections": 0,           // minimum picks (multi)
        "max_selections": null,        // max picks; null = no limit (multi); 1 for single
        "items": [{{
          "ref": "oi_1",               // stable id: oi_*
          "label": "string",           // choice name as printed
          "price_delta_mxn": 0         // extra charge in pesos; 0 or null if included
        }}]
      }}],
      "constraints_notes": "string | null"  // free-text rules (e.g. "hasta 2 sabores")
    }}]
  }}],
  "promotions": [{{
    "ref": "promo_1",                  // stable id: promo_*
    "name": "string",                  // promo title as printed
    "type": "two_for_one | percent | amount | combo",
    "scope": "product | category | order",  // what the promo applies to
    "percent": null,                   // for type=percent (1–100)
    "amount_mxn": null,                // for type=amount, pesos off
    "bundle": {{                       // for NxM (type=two_for_one); else null
      "get_quantity": 2,               // items customer takes
      "pay_quantity": 1,               // items customer pays for
      "pairing_mode": "cross_product | same_product"
    }},
    "target_product_refs": [],         // prod_* included in promo
    "target_category_refs": [],        // cat_* included in promo
    "eligible_option_item_refs": [],   // oi_* that count toward NxM; [] = none
    "schedule_notes": "string | null", // human schedule text from menu
    "schedule": {{                     // structured schedule; empty if anytime
      "weekdays": [],                  // 0=Mon … 6=Sun
      "use_time_window": false
    }},
    "constraints_notes": "string | null"  // extra promo rules from menu
  }}],
  "global_rules": ["string"],          // menu-wide notes (not tied to one item)
  "unmapped_text": ["string"],         // legible text you could not place
  "open_questions": [{{
    "id": "q1",                        // unique id: q1, q2…
    "question_es": "string",           // question for the owner (Spanish)
    "context": "string",               // where on the menu the doubt comes from
    "related_refs": []                 // prod_*, og_*, promo_*, etc.
  }}]
}}

Output JSON only. No markdown fences.

The import draft stores prices in MXN pesos.

After extraction, the system derives `has_catalog_discount`, NxM `label`, and
`participating_complements` / `excluded_complements` from refs — you only need to set
`catalog_discount`, `eligible_option_item_refs`, and complement group rules correctly."""
