"""Gather full product context for image generation prompts."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.pagination import PaginationParams
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import (
    _product_payload_with_promotions,
    _promotion_name_maps,
    _restaurant_timezone,
)
from app.modules.menu.schemas import ProductDTO
from app.modules.menu.service import MenuService
from app.modules.promotions.service import PromotionService


def gather_product_context(
    ctx: AgentContext,
    service: MenuService,
    product: ProductDTO,
) -> dict[str, Any]:
    """Return the same rich product payload menu_read uses (incl. promos & add-ons)."""
    promo_service = PromotionService(ctx.uow.promotions)
    timezone = _restaurant_timezone(ctx)
    product_names, category_names = _promotion_name_maps(service, ctx.restaurant_id)
    payload = _product_payload_with_promotions(
        product,
        promo_service=promo_service,
        timezone=timezone,
        product_names=product_names,
        category_names=category_names,
    )

    category_labels: list[str] = []
    for category_id in product.category_ids:
        label = category_names.get(str(category_id))
        if label:
            category_labels.append(label)
    if category_labels:
        payload["category_names"] = category_labels

    restaurant = ctx.uow.restaurants.get(ctx.restaurant_id)
    payload["restaurant_name"] = getattr(restaurant, "name", None)
    return payload


def product_has_image(context: dict[str, Any]) -> bool:
    image_path = context.get("image_path")
    return bool(isinstance(image_path, str) and image_path.strip())


def resolve_product_ids(
    service: MenuService,
    restaurant_id: uuid.UUID,
    *,
    product_ids: list[uuid.UUID] | None = None,
    only_missing: bool = True,
    limit: int,
) -> list[ProductDTO]:
    """Return products to generate images for (active products only)."""
    if product_ids:
        products: list[ProductDTO] = []
        for product_id in product_ids[:limit]:
            product = service.get_product(restaurant_id, product_id)
            if not product.is_active:
                continue
            if only_missing and product.image_path and str(product.image_path).strip():
                continue
            products.append(product)
        return products

    page = service.list_products(restaurant_id, PaginationParams(limit=500))
    candidates = [
        product
        for product in page.items
        if product.is_active
        and (not only_missing or not (product.image_path and str(product.image_path).strip()))
    ]
    return candidates[:limit]
