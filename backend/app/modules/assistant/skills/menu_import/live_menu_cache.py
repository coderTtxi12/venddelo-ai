"""Compact live-menu snapshot for import sessions (Postgres memory layer)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.modules.assistant.skills.context import AgentContext
from app.modules.menu.schemas import FullMenuDTO, OptionGroupDTO, ProductDTO
from app.modules.menu.service import MenuService


def _option_group_row(group: OptionGroupDTO) -> dict[str, Any]:
    return {
        "title": group.title,
        "required": group.required,
        "selection": group.selection,
        "items": [
            {
                "label": item.label,
                "price_delta_cents": item.price_delta_cents,
                "is_active": item.is_active,
            }
            for item in group.items
            if item.is_active
        ],
    }


def _product_row(product: ProductDTO) -> dict[str, Any]:
    return {
        "id": str(product.id),
        "name": product.name,
        "description": product.description,
        "price_cents": product.price_cents,
        "status": product.status,
        "category_ids": [str(item) for item in product.category_ids],
        "option_groups": [
            _option_group_row(group)
            for group in sorted(product.option_groups, key=lambda g: g.sort_index)
            if group.is_active
        ],
    }


def build_live_menu_snapshot(menu: FullMenuDTO) -> dict[str, Any]:
    return {
        "captured_at": datetime.now(UTC).isoformat(),
        "categories": [
            {
                "id": str(category.id),
                "name": category.name,
                "sort_index": category.sort_index,
                "is_active": category.is_active,
            }
            for category in sorted(menu.categories, key=lambda c: c.sort_index)
        ],
        "products": [_product_row(product) for product in menu.products],
        "counts": {
            "categories": len(menu.categories),
            "products": len(menu.products),
        },
    }


def capture_live_menu_snapshot(ctx: AgentContext) -> dict[str, Any]:
    menu = MenuService(ctx.uow.menu).get_full_menu(ctx.restaurant_id)
    return build_live_menu_snapshot(menu)
