"""Vision prompt for matching uploaded product photos to import draft refs."""

from __future__ import annotations

from typing import Any


def build_photo_match_prompt(
    products: list[dict[str, Any]],
    *,
    image_path: str,
    original_name: str | None = None,
) -> str:
    catalog_lines = []
    for product in products:
        ref = product.get("ref", "")
        name = product.get("name", "")
        description = product.get("description") or ""
        line = f'- ref={ref!r} name={name!r}'
        if description:
            line += f" description={description!r}"
        catalog_lines.append(line)

    catalog_block = "\n".join(catalog_lines) if catalog_lines else "(no products in menu yet)"
    filename_hint = f" Original filename: {original_name!r}." if original_name else ""

    return f"""You match restaurant product photos to menu items extracted from an import session.

Given ONE product photo and the catalog below, identify the best matching menu item.

Photo storage path: {image_path!r}.{filename_hint}

Catalog (stable refs for mapping):
{catalog_block}

Return strict JSON:
{{
  "product_ref": "prod_1 or null when no reasonable match",
  "confidence": 0.0,
  "candidates": [
    {{"product_ref": "prod_2", "confidence": 0.58, "reason_es": "short reason in Spanish"}}
  ],
  "reason_es": "short explanation in Spanish for the top match or why unmatched"
}}

Rules:
- Transcribe what you see; do not invent menu items not in the catalog.
- confidence is 0.0-1.0 for product_ref.
- Include up to 3 candidates sorted by confidence when unsure.
- Use null product_ref when the photo is not food/product or no catalog item fits.
"""
