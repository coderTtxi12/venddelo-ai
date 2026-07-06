"""Generate, upload, and attach AI promotion banners."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import NotFoundError
from app.core.image.ports import ImageGenerationError, ImageGenerationRequest
from app.core.storage import StorageError
from app.infra.image.factory import build_image_provider
from app.infra.storage.factory import build_storage
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.promotions.banner_prompt import (
    build_promotion_banner_prompt,
    is_placeholder_promotion_banner,
    promotion_banner_context_from_promo,
    resolve_target_names,
)
from app.modules.assistant.skills.promotions.banner_storage import (
    PROMO_BANNER_CONTENT_TYPE,
    PROMO_BANNER_SIZE,
    promotion_banner_storage_path,
)
from app.modules.promotions.schemas import PromotionDTO, PromotionUpdate
from app.modules.promotions.service import PromotionService
from app.modules.restaurants.service import RestaurantService


def generate_and_attach_promotion_banner(
    *,
    ctx: AgentContext,
    promo_service: PromotionService,
    promo: PromotionDTO,
    product_names_map: dict[str, str],
    category_names_map: dict[str, str],
    headline: str | None = None,
    offer_label: str | None = None,
    cta_text: str | None = None,
    show_countdown: bool | None = None,
    style_notes: str | None = None,
    force: bool = False,
) -> ToolResult:
    if not force and not is_placeholder_promotion_banner(
        promo.image_path,
        restaurant_id=str(ctx.restaurant_id),
    ):
        return ToolResult(
            ok=False,
            summary=(
                f"Promotion {promo.name!r} already has a custom banner; "
                "pass force=true to replace it"
            ),
            data={
                "promotion_id": str(promo.id),
                "image_path": promo.image_path,
            },
        )

    restaurant = RestaurantService(ctx.uow.restaurants).get(ctx.restaurant_id)
    product_names, category_names = resolve_target_names(
        promo,
        product_names_map=product_names_map,
        category_names_map=category_names_map,
    )
    banner_context = promotion_banner_context_from_promo(
        promo,
        restaurant_name=restaurant.name,
        product_names=product_names,
        category_names=category_names,
        headline=headline,
        offer_label=offer_label,
        cta_text=cta_text,
        show_countdown=show_countdown,
    )
    prompt = build_promotion_banner_prompt(banner_context, style_notes=style_notes)

    try:
        generated = build_image_provider().generate(
            ImageGenerationRequest(prompt=prompt, size=PROMO_BANNER_SIZE)
        )
        content_type = generated.content_type or PROMO_BANNER_CONTENT_TYPE
        if content_type != PROMO_BANNER_CONTENT_TYPE:
            content_type = PROMO_BANNER_CONTENT_TYPE
        stored = build_storage().upload(
            promotion_banner_storage_path(ctx.restaurant_id),
            generated.data,
            content_type,
        )
    except (ImageGenerationError, StorageError) as exc:
        return ToolResult(
            ok=False,
            summary=f"Banner generation failed for {promo.name!r}: {exc}",
            data={
                "promotion_id": str(promo.id),
                "prompt_preview": prompt[:320],
            },
        )

    try:
        updated = promo_service.update(
            ctx.restaurant_id,
            promo.id,
            PromotionUpdate(image_path=stored.path),
        )
    except NotFoundError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Promotion not found")

    return ToolResult(
        ok=True,
        summary=f"Generated marketing banner for {updated.name!r}",
        data={
            "promotion_id": str(updated.id),
            "promotion_name": updated.name,
            "image_path": stored.path,
            "public_url": stored.public_url,
            "offer_label": banner_context.offer_label,
            "headline": banner_context.headline,
            "prompt_preview": prompt[:320],
            "image_model": generated.model,
            "revised_prompt": generated.revised_prompt,
        },
    )
