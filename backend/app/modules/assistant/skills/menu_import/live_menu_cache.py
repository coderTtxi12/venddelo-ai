"""Compact live-menu snapshot for import sessions (Postgres memory layer)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.pagination import PaginationParams
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_read.promotions import (
    discount_label,
    is_catalog_discount,
    promotion_payload,
    schedule_summary,
)
from app.modules.menu.schemas import FullMenuDTO, OptionGroupDTO, ProductDTO
from app.modules.menu.service import MenuService
from app.modules.promotions.option_item_sync import is_nxm_bundle_promo
from app.modules.promotions.schemas import PromotionDTO, enrich_promotion_dto
from app.modules.promotions.service import PromotionService

_PROMOTION_SCAN_LIMIT = 200


def _restaurant_timezone(ctx: AgentContext) -> str:
    restaurant = ctx.uow.restaurants.get(ctx.restaurant_id)
    return getattr(restaurant, "timezone", None) or "America/Mexico_City"


def _option_group_row(group: OptionGroupDTO) -> dict[str, Any]:
    return {
        "id": str(group.id),
        "title": group.title,
        "required": group.required,
        "selection": group.selection,
        "min_selections": group.min_selections,
        "max_selections": group.max_selections,
        "sort_index": group.sort_index,
        "items": [
            {
                "id": str(item.id),
                "label": item.label,
                "price_delta_cents": item.price_delta_cents,
                "is_active": item.is_active,
            }
            for item in group.items
            if item.is_active
        ],
    }


def _option_item_index(products: list[ProductDTO]) -> dict[uuid.UUID, dict[str, Any]]:
    index: dict[uuid.UUID, dict[str, Any]] = {}
    for product in products:
        for group in product.option_groups:
            if not group.is_active:
                continue
            for item in group.items:
                if not item.is_active:
                    continue
                index[item.id] = {
                    "id": str(item.id),
                    "label": item.label,
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "group_title": group.title,
                    "price_delta_cents": item.price_delta_cents,
                }
    return index


def _name_maps(menu: FullMenuDTO) -> tuple[dict[str, str], dict[str, str]]:
    product_names = {str(product.id): product.name for product in menu.products}
    category_names = {str(category.id): category.name for category in menu.categories}
    return product_names, category_names


def _catalog_discount_for_product(
    product_id: uuid.UUID,
    promotions: list[PromotionDTO],
) -> dict[str, Any] | None:
    for promo in promotions:
        if not is_catalog_discount(promo):
            continue
        if product_id not in promo.product_ids:
            continue
        if promo.type == "percent" and promo.percent is not None:
            return {
                "promotion_id": str(promo.id),
                "type": "percent",
                "percent": promo.percent,
                "label": discount_label(promo),
            }
        if promo.type == "amount" and promo.amount_cents is not None:
            return {
                "promotion_id": str(promo.id),
                "type": "amount",
                "amount_cents": promo.amount_cents,
                "label": discount_label(promo),
            }
    return None


def _complements_for_product_ids(
    product_ids: list[uuid.UUID],
    products_by_id: dict[uuid.UUID, ProductDTO],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[uuid.UUID] = set()
    for product_id in product_ids:
        product = products_by_id.get(product_id)
        if product is None:
            continue
        for group in product.option_groups:
            if not group.is_active:
                continue
            for item in group.items:
                if not item.is_active or item.id in seen:
                    continue
                seen.add(item.id)
                rows.append(
                    {
                        "id": str(item.id),
                        "label": item.label,
                        "product_id": str(product.id),
                        "product_name": product.name,
                        "group_title": group.title,
                        "price_delta_cents": item.price_delta_cents,
                    }
                )
    rows.sort(key=lambda row: (row["product_name"], row["group_title"], row["label"]))
    return rows


def _nxm_promotion_row(
    promo: PromotionDTO,
    *,
    product_names: dict[str, str],
    category_names: dict[str, str],
    option_index: dict[uuid.UUID, dict[str, Any]],
    products_by_id: dict[uuid.UUID, ProductDTO],
) -> dict[str, Any]:
    payload = promotion_payload(
        promo,
        product_names=product_names,
        category_names=category_names,
    )
    allowed_ids = set(promo.option_item_ids)
    promo_product_ids = list(promo.product_ids)
    all_complements = _complements_for_product_ids(promo_product_ids, products_by_id)
    participating = [
        option_index[item_id]
        for item_id in promo.option_item_ids
        if item_id in option_index
    ]
    excluded = [row for row in all_complements if uuid.UUID(row["id"]) not in allowed_ids]
    payload["participating_complements"] = participating
    payload["excluded_complements"] = excluded
    schedule = schedule_summary(promo)
    if schedule is not None:
        payload["schedule"] = schedule
    return payload


def _product_row(
    product: ProductDTO,
    *,
    catalog_discount: dict[str, Any] | None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
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
        "has_catalog_discount": catalog_discount is not None,
    }
    if catalog_discount is not None:
        row["catalog_discount"] = catalog_discount
    return row


def build_live_menu_snapshot(
    menu: FullMenuDTO,
    *,
    promotions: list[PromotionDTO] | None = None,
) -> dict[str, Any]:
    promo_list = [enrich_promotion_dto(promo) for promo in (promotions or [])]
    product_names, category_names = _name_maps(menu)
    products_by_id = {product.id: product for product in menu.products}
    option_index = _option_item_index(menu.products)

    nxm_promotions = [
        _nxm_promotion_row(
            promo,
            product_names=product_names,
            category_names=category_names,
            option_index=option_index,
            products_by_id=products_by_id,
        )
        for promo in promo_list
        if is_nxm_bundle_promo(promo)
    ]

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
        "products": [
            _product_row(
                product,
                catalog_discount=_catalog_discount_for_product(product.id, promo_list),
            )
            for product in menu.products
        ],
        "nxm_promotions": nxm_promotions,
        "counts": {
            "categories": len(menu.categories),
            "products": len(menu.products),
            "nxm_promotions": len(nxm_promotions),
            "products_with_catalog_discount": sum(
                1
                for product in menu.products
                if _catalog_discount_for_product(product.id, promo_list) is not None
            ),
        },
    }


def capture_live_menu_snapshot(ctx: AgentContext) -> dict[str, Any]:
    menu = MenuService(ctx.uow.menu).get_full_menu(ctx.restaurant_id)
    timezone = _restaurant_timezone(ctx)
    promo_service = PromotionService(ctx.uow.promotions)
    page = promo_service.list_for_admin(
        ctx.restaurant_id,
        PaginationParams(limit=_PROMOTION_SCAN_LIMIT),
        timezone=timezone,
    )
    return build_live_menu_snapshot(menu, promotions=list(page.items))
