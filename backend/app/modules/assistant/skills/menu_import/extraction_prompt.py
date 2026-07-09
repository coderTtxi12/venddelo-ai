from __future__ import annotations

import json
from typing import Any


def _currency_context(context: dict[str, Any]) -> tuple[str, str, str]:
    discovery = context.get("discovery_answers") or {}
    currency = discovery.get("currency") or context.get("currency") or "MXN"
    cuisine = discovery.get("cuisine_type") or discovery.get("cuisine") or ""
    cuisine_line = f"\nRestaurant cuisine hint: {cuisine}." if cuisine else ""
    return currency, cuisine_line, discovery


def _json_schema_block(currency: str) -> str:
    return f"""Return a single JSON object with this shape (// = field meaning):
{{
  "categories": [{{
    "ref": "cat_1",
    "name": "string",
    "description": "string | null",
    "sort_order": 0,
    "products": [{{
      "ref": "prod_1",
      "name": "string",
      "description": "string | null",
      "price_mxn": 0,
      "currency": "{currency}",
      "is_available": true,
      "catalog_discount": null,
      "option_groups": [{{
        "ref": "og_1",
        "title": "string",
        "selection": "single | multi",
        "required": false,
        "min_selections": 0,
        "max_selections": null,
        "items": [{{
          "ref": "oi_1",
          "label": "string",
          "price_delta_mxn": 0
        }}]
      }}],
      "constraints_notes": "string | null"
    }}]
  }}],
  "promotions": [{{
    "ref": "promo_1",
    "name": "string",
    "type": "two_for_one | percent | amount | combo",
    "scope": "product | category | order",
    "percent": null,
    "amount_mxn": null,
    "bundle": {{
      "get_quantity": 2,
      "pay_quantity": 1,
      "pairing_mode": "cross_product | same_product"
    }},
    "target_product_refs": [],
    "target_category_refs": [],
    "eligible_option_item_refs": [],
    "schedule_notes": "string | null",
    "schedule": {{
      "weekdays": [],
      "use_time_window": false
    }},
    "constraints_notes": "string | null"
  }}],
  "global_rules": ["string"],
  "unmapped_text": ["string"]
}}"""


def build_literal_ocr_prompt(context: dict[str, Any]) -> str:
    """Phase 1: transcribe the menu as printed — no owner restructuring."""
    currency, cuisine_line, _ = _currency_context(context)
    return f"""You are a menu OCR engine. Transcribe ONLY what is visible in the source.
Default currency: {currency}.{cuisine_line}

Rules:
- Mirror the printed layout: each distinct priced line is usually its own product.
- Do NOT consolidate size/quantity variants into one product.
- Shared choice lists printed separately → attach `option_groups` only when scope is explicit; else use `global_rules` or `unmapped_text`.
- Section/category footnotes about static inclusions → `global_rules` verbatim; also copy to each applicable product `description` when scope is clear.
- Per-variant selection limits belong on that variant line or `constraints_notes` — not as the product `description`.
- Never invent items, prices, or promos. Prices in pesos ({currency}); never centavos.
- Refs: cat_1, prod_1, og_1, oi_1, promo_1 (unique). Missing price → `null` + `unmapped_text`.

{_json_schema_block(currency)}

Output JSON only. No markdown fences."""


def build_modeling_prompt(context: dict[str, Any]) -> str:
    """Phase 2: restructure a literal OCR draft for self-service ordering."""
    currency, cuisine_line, discovery = _currency_context(context)
    menu_context = str(context.get("menu_context") or discovery.get("menu_context") or "").strip()

    owner_block = ""
    if menu_context:
        owner_block = (
            "\n\nOwner instructions (PRIMARY — follow exactly when restructuring):\n"
            f"{menu_context}"
        )

    return f"""You restructure a literal menu OCR draft into an orderable digital menu.
Default currency: {currency}.{cuisine_line}{owner_block}

Input: literal OCR JSON from the user message. Output: restructured draft, same schema.
Never add items or prices that are not in the literal draft.
The output must include **every** category and product from the literal draft.
When owner instructions scope changes to specific products only:
restructure ONLY those items — pass through all other literal categories and products unchanged.

**Product modeling** (when owner instructions are silent):
- Same dish, only size/quantity/weight differs → one product + required size/quantity group.
- Shared lists printed once → same `option_groups` on each applicable product; unique oi_* refs per product.
- Variant pricing: `price_mxn` = cheapest variant; others use `price_delta_mxn` = (price − base).
- Group order: size/quantity → required choices → optional add-ons.
- Infer `required`, `min_selections`, `max_selections` from printed wording and owner instructions.
- One price, no choices → `option_groups: []`.

**Description vs rules:**
- `description` = what the customer gets (ingredients, sides, static inclusions). Pull from product text, category blurbs, or literal `global_rules`/`unmapped_text` footnotes that apply to that product — even when printed elsewhere on the menu.
- Never put selection limits in `description` — encode limits in `option_groups` min/max or `constraints_notes`.
- After consolidating variant lines, move per-variant choice caps from `description` into the relevant choice group rules.

Rules:
- Prices in pesos ({currency}); never centavos.
- Per-item discount → `catalog_discount` on product, not `promotions`.
- Promotions: NxM → `two_for_one` + bundle + refs; campaigns → percent/amount; combos → combo.

{_json_schema_block(currency)}

Output JSON only. No markdown fences."""


def build_extraction_prompt(context: dict[str, Any]) -> str:
    """Backward-compatible alias for the modeling-phase prompt."""
    return build_modeling_prompt(context)
