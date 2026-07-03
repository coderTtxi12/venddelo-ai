"""Prompt builders for product photo analysis and complement suggestions."""

from __future__ import annotations

import json
from typing import Any


def build_image_analysis_prompt(context: dict[str, Any]) -> str:
    return (
        "You analyze restaurant menu product photos for a digital ordering platform. "
        "Respond ONLY with valid JSON (no markdown).\n\n"
        f"Product name: {context.get('name')}\n"
        f"Description: {context.get('description') or '(none)'}\n"
        f"Categories: {', '.join(context.get('category_names') or []) or '(none)'}\n"
        f"Existing complement groups: {json.dumps(context.get('existing_option_groups') or [], ensure_ascii=False)}\n\n"
        "Return JSON with keys:\n"
        "- dish_type (short string)\n"
        "- visible_components (string[] ingredients/parts seen)\n"
        "- visible_add_on_ideas (string[] extras that would fit THIS dish)\n"
        "- beverage_pairing_ideas (string[] drink names that pair well)\n"
        "- confidence (high|medium|low)\n"
        "- notes (string, optional)\n"
        "Be specific to what you SEE in the image. Do not invent text printed on packaging."
    )


def build_complement_suggestion_prompt(
    context: dict[str, Any],
    *,
    image_analysis: dict[str, Any] | None,
    peer_patterns: list[dict[str, Any]],
    beverage_hints: list[dict[str, Any]],
) -> str:
    analysis_block = (
        json.dumps(image_analysis, ensure_ascii=False)
        if image_analysis
        else "(no image analysis — use product text and catalog hints only)"
    )
    return (
        "You suggest NEW complement option groups for ONE restaurant product. "
        "Complements are option_items created ONLY on this product — never links to other "
        "product IDs. Each option_item is new and unique to this product.\n"
        "Respond ONLY with valid JSON (no markdown).\n\n"
        f"Target product:\n{json.dumps(context, ensure_ascii=False)}\n\n"
        f"Photo analysis:\n{analysis_block}\n\n"
        f"Peer complement patterns (inspiration only — do NOT reuse IDs):\n"
        f"{json.dumps(peer_patterns, ensure_ascii=False)}\n\n"
        f"Beverage menu names/prices (inspiration for drink add-on labels only):\n"
        f"{json.dumps(beverage_hints, ensure_ascii=False)}\n\n"
        "Rules:\n"
        "- Do NOT duplicate existing groups/items on the target product.\n"
        "- Prefer 1–4 groups, 2–8 items per group.\n"
        "- price_delta_cents is in cents (0 = free, 1500 = 15 MXN).\n"
        "- selection: single or multi; set required/min_selections/max_selections logically.\n"
        "- Use Spanish labels suitable for Mexico unless the product is clearly English.\n"
        "- Beverage suggestions become option_item labels (e.g. 'Coca-Cola 600ml +$25'), "
        "NOT separate menu product links.\n\n"
        "Return JSON:\n"
        "{\n"
        '  "suggested_groups": [\n'
        "    {\n"
        '      "title": "string",\n'
        '      "required": false,\n'
        '      "selection": "single|multi",\n'
        '      "min_selections": 0,\n'
        '      "max_selections": 1,\n'
        '      "rationale": "string",\n'
        '      "items": [{"label": "string", "price_delta_cents": 0, "rationale": "string"}]\n'
        "    }\n"
        "  ],\n"
        '  "notes": "string"\n'
        "}"
    )
