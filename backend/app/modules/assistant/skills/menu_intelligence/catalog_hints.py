"""Catalog hints for complement suggestions (patterns only — never shared IDs)."""

from __future__ import annotations

import uuid
from typing import Any

from app.modules.assistant.skills.product_resolve import iter_catalog_products
from app.modules.menu.schemas import CategoryDTO, ProductDTO
from app.modules.menu.service import MenuService

_BEVERAGE_CATEGORY_TOKENS = (
    "bebida",
    "bebidas",
    "drink",
    "drinks",
    "refresco",
    "refrescos",
    "agua",
    "jugo",
    "jugos",
)


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


def gather_peer_complement_patterns(
    service: MenuService,
    restaurant_id: uuid.UUID,
    product: ProductDTO,
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Option-group patterns from active peers in overlapping categories."""
    product_categories = set(product.category_ids)
    if not product_categories:
        return []

    patterns: list[dict[str, Any]] = []
    for peer in iter_catalog_products(service, restaurant_id):
        if peer.id == product.id or not peer.is_active:
            continue
        if not product_categories.intersection(peer.category_ids):
            continue
        peer_groups = _option_items_payload(peer)
        if not peer_groups:
            continue
        patterns.append(
            {
                "peer_product_name": peer.name,
                "option_groups": peer_groups,
            }
        )
        if len(patterns) >= limit:
            break
    return patterns


def _category_is_beverage(category: CategoryDTO) -> bool:
    name = (category.name or "").casefold()
    return any(token in name for token in _BEVERAGE_CATEGORY_TOKENS)


def gather_beverage_menu_hints(
    service: MenuService,
    restaurant_id: uuid.UUID,
    *,
    limit: int = 12,
) -> list[dict[str, Any]]:
    """Drink product names/prices for naming inspiration (not linked as product IDs)."""
    from app.core.pagination import PaginationParams

    category_page = service.list_all_categories(
        restaurant_id, PaginationParams(limit=100)
    )
    beverage_category_ids = {
        category.id for category in category_page.items if _category_is_beverage(category)
    }
    if not beverage_category_ids:
        return []

    hints: list[dict[str, Any]] = []
    for item in iter_catalog_products(service, restaurant_id):
        if not item.is_active:
            continue
        if not beverage_category_ids.intersection(item.category_ids):
            continue
        hints.append(
            {
                "name": item.name,
                "description": item.description,
                "price_cents": item.price_cents,
            }
        )
        if len(hints) >= limit:
            break
    return hints
