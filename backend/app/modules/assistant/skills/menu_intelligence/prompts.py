"""Prompt builders for product photo analysis."""

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
