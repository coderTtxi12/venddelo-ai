from __future__ import annotations

import json
from typing import Any


def build_optimization_prompt(draft: dict[str, Any], context: dict[str, Any]) -> str:
    discovery = context.get("discovery_answers") or {}
    return f"""You optimize a restaurant digital menu draft for conversion, clarity, and complement UX.
Apply menu_best_practices: promos first, strong mains with complements, short appetizing descriptions,
sensible category layouts (grid for photo-heavy, horizontal for promos, vertical default).

Input draft (JSON, prices in MXN pesos):
{json.dumps(draft, ensure_ascii=False)}

Owner context:
{json.dumps(discovery, ensure_ascii=False)}

Rules:
- Keep all refs unchanged (cat_*, prod_*, og_*, oi_*, promo_*).
- Do NOT add or remove products, categories, promotions, option groups, or option items.
- You MAY improve product descriptions and set sort_order on categories/products.
- display_layout per category: "vertical" | "horizontal" | "grid".

**Complement groups (option_groups) — infer from menu context and product type:**
- "Elige tamaño", "Tamaño", "Size" → required=true, selection=single, min_selections=1, max_selections=1
- "Elige salsa", mandatory wording → required=true, single, min=1, max=1
- "Extras", "Agrega", "Adicionales", "+$" items → required=false, selection=multi, min_selections=0,
  max_selections=5 (or count of items if fewer)
- Optional sides / "Sin costo" choices → required=false, single, min=0, max=1
- When menu says "incluye" or base price covers one choice → required=true for that group
- Set price_delta_mxn on items when menu shows "+$X" or extra charge
- Order groups: required/size first, then flavor/salsa, then paid extras last
- Order items within each group by popularity / menu print order

Return optimization_notes_es in Spanish (bullets for owner preview).
Pick recommended_theme_id from context or null.

Return JSON only:
{{
  "categories": [{{
    "ref": "cat_1",
    "sort_order": 0,
    "display_layout": "grid",
    "products": [{{
      "ref": "prod_1",
      "sort_order": 0,
      "description": "optional improved text",
      "option_groups": [{{
        "ref": "og_1",
        "sort_order": 0,
        "required": true,
        "selection": "single",
        "min_selections": 1,
        "max_selections": 1,
        "items": [{{"ref": "oi_1", "sort_order": 0, "price_delta_mxn": 15}}]
      }}]
    }}]
  }}],
  "optimization_notes_es": ["string"],
  "recommended_theme_id": "theme-id-or-null"
}}
"""
