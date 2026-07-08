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

Rules:
- Transcribe literally; never invent categories, products, prices, or promotions.
- **Prices in pesos ({currency}) as printed on the menu** — use `price_mxn` / `price_delta_mxn` /
  `amount_mxn` as whole pesos or decimals (e.g. $229 → 229, $85.50 → 85.5). **Never use centavos.**
  If a price is missing or illegible, use `null` or omit it (defaults to 0) and add an open_question.
- Optional text fields (`description`, `constraints_notes`, complement labels) may be `null` when absent.
- Complement items without an extra charge use `price_delta_mxn: null` or `0`.
- Assign stable refs: cat_1, prod_1, og_1, oi_1, promo_1 (unique within this extraction).
- Ambiguous or illegible prices → add to unmapped_text and open_questions; do not guess.
- Partially readable promo or complement rules → mandatory open_questions entry (question_es in Spanish).
- Preserve product availability as is_available=true unless explicitly marked unavailable.
- **Complement groups (option_groups)** — infer from menu text when visible:
  - "Elige tamaño", "Tamaño", size choices → required=true, selection=single, min_selections=1, max_selections=1
  - "Elige salsa", "Escoge", mandatory wording → required=true, single, min=1, max=1
  - "Extras", "Agrega", "Adicionales", items with "+$" → required=false, selection=multi, min_selections=0,
    max_selections=number of items (or 5 if many)
  - Optional free choices ("Sin costo", "Incluye") → required=false, single, min=0, max=1
  - If menu marks a choice as included in base price → required=true for that group
  - Set price_delta_mxn when menu shows "+$X" or extra charge next to the item
  - If required vs optional is unclear → open_questions (do not guess)
- option_groups.selection is "single" or "multi"; min_selections/max_selections must match required flag.
- Promotion types: two_for_one, percent, amount, combo. scope: product, category, or order.

Return a single JSON object with this shape:
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
      "option_groups": [{{
        "ref": "og_1",
        "title": "string",
        "selection": "single | multi",
        "required": false,
        "min_selections": 0,
        "max_selections": 1,
        "items": [{{"ref": "oi_1", "label": "string", "price_delta_mxn": 0}}]
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
    "bundle": null,
    "target_product_refs": [],
    "target_category_refs": [],
    "eligible_option_item_refs": [],
    "schedule_notes": "string | null",
    "schedule": {{"weekdays": [], "use_time_window": false}},
    "constraints_notes": "string | null"
  }}],
  "global_rules": ["string"],
  "unmapped_text": ["string"],
  "open_questions": [{{
    "id": "q1",
    "question_es": "string",
    "context": "string",
    "related_refs": []
  }}]
}}

Output JSON only. No markdown fences.

The import draft stores prices in MXN pesos. The application layer converts to integer
centavos when writing to the live menu database (multiply by 100, round)."""
