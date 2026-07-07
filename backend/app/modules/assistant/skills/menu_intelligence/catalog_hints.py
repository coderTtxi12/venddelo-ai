"""Catalog hints for product image analysis (option-group payloads)."""

from __future__ import annotations

from typing import Any

from app.modules.menu.schemas import ProductDTO


def _option_items_payload(product: ProductDTO) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for group in sorted(product.option_groups, key=lambda item: item.sort_index):
        if not group.is_active:
            continue
        items = [
            {
                "label": item.label,
                "price_delta_cents": item.price_delta_cents,
            }
            for item in sorted(group.items, key=lambda item: item.sort_index)
            if item.is_active
        ]
        if not items:
            continue
        groups.append(
            {
                "title": group.title,
                "required": group.required,
                "selection": group.selection,
                "min_selections": group.min_selections,
                "max_selections": group.max_selections,
                "items": items,
            }
        )
    return groups


def existing_groups_payload(product: ProductDTO) -> list[dict[str, Any]]:
    return _option_items_payload(product)
