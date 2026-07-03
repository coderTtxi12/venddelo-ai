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
- Assign stable refs: cat_1, prod_1, og_1, oi_1, promo_1 (unique within this extraction).
- Ambiguous or illegible prices → add to unmapped_text and open_questions; do not guess.
- Partially readable promo or complement rules → mandatory open_questions entry (question_es in Spanish).
- Preserve product availability as is_available=true unless explicitly marked unavailable.
- option_groups.selection is "single" or "multi"; set min_selections/max_selections accordingly.
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
      "price_cents": 0,
      "currency": "{currency}",
      "is_available": true,
      "option_groups": [{{
        "ref": "og_1",
        "title": "string",
        "selection": "single | multi",
        "required": false,
        "min_selections": 0,
        "max_selections": 1,
        "items": [{{"ref": "oi_1", "label": "string", "price_delta_cents": 0}}]
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
    "amount_cents": null,
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

Output JSON only. No markdown fences."""
