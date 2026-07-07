"""Gather full product context for image generation prompts."""

from __future__ import annotations

from typing import Any

from app.modules.assistant.skills.context import AgentContext
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
