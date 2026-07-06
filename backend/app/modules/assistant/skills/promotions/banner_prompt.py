"""Build marketing promo banner prompts (16:9 food-delivery style)."""

from __future__ import annotations

from dataclasses import dataclass

from app.modules.assistant.skills.menu_read.promotions import discount_label, promotion_display_name
from app.modules.promotions.schemas import PromotionDTO


def is_placeholder_promotion_banner(image_path: str | None, *, restaurant_id: str) -> bool:
    if not image_path or not str(image_path).strip():
        return True
    path = str(image_path).strip().lower()
    if "promo-banner-placeholder" in path:
        return True
    if path.endswith("/assistant/promo-banner-placeholder.png"):
        return True
    if path.endswith("/import/promo-banner-placeholder.png"):
        return True
    return False


@dataclass(frozen=True, slots=True)
class PromotionBannerContext:
    headline: str
    offer_label: str
    hero_food: str
    restaurant_name: str
    cta_text: str
    footer_text: str
    show_countdown: bool
    countdown_hint: str | None


def build_promotion_banner_prompt(
    context: PromotionBannerContext,
    *,
    style_notes: str | None = None,
) -> str:
    countdown_block = ""
    if context.show_countdown:
        countdown_block = (
            "Top-right corner: a dark semi-transparent rounded badge with a small clock icon "
            'and white text "TERMINA HOY EN" plus a yellow countdown time placeholder '
            f'("{context.countdown_hint or "19:46:32"}"). '
        )

    parts = [
        "Professional digital-menu marketing banner, landscape 16:9 aspect ratio, "
        "high-contrast food-delivery promo creative.",
        f'Left side bold typography on dark rustic background: red brushstroke badge with '
        f'white text "¡PROMO!", large white condensed headline "{context.headline}", '
        f'giant textured yellow offer "{context.offer_label}", yellow brushstroke CTA strip '
        f'with black text "{context.cta_text}" and small black stars, smaller white footer '
        f'"{context.footer_text}".',
        f"Right side: appetizing close-up food photography of {context.hero_food}, "
        "gourmet restaurant quality, warm bokeh lights, dark wood surface, mouth-watering.",
        countdown_block,
        f"Restaurant brand context: {context.restaurant_name}.",
        "Style: Mexican/LATAM delivery app promo banner, energetic, premium, photorealistic "
        "food on the right, graphic design overlays on the left, crisp readable Spanish text, "
        "red (#cc0000) and yellow (#ffcc00) accents, no watermarks, no third-party logos.",
    ]
    if style_notes and style_notes.strip():
        parts.append(f"Additional direction: {style_notes.strip()}.")
    return " ".join(parts)


def promotion_banner_context_from_promo(
    promo: PromotionDTO,
    *,
    restaurant_name: str,
    product_names: list[str],
    category_names: list[str],
    headline: str | None = None,
    offer_label: str | None = None,
    cta_text: str | None = None,
    show_countdown: bool | None = None,
) -> PromotionBannerContext:
    display_name = promotion_display_name(promo)
    label = offer_label or discount_label(promo)
    hero_parts: list[str] = []
    if product_names:
        hero_parts.append(product_names[0])
    elif category_names:
        hero_parts.append(f"dishes from {category_names[0]} category")
    else:
        hero_parts.append(display_name)
    hero_food = hero_parts[0]
    if len(product_names) > 1:
        hero_food = f"{hero_food} (promo includes {', '.join(product_names[:3])})"

    resolved_headline = (headline or display_name).strip().upper()
    resolved_cta = (cta_text or "¡APROVECHA!").strip()
    footer = f"{display_name} {label}".strip()
    should_show_countdown = show_countdown if show_countdown is not None else promo.ends_at is not None

    return PromotionBannerContext(
        headline=resolved_headline,
        offer_label=label.upper().replace("×", "X"),
        hero_food=hero_food,
        restaurant_name=restaurant_name,
        cta_text=resolved_cta,
        footer_text=footer,
        show_countdown=should_show_countdown,
        countdown_hint="19:46:32" if should_show_countdown else None,
    )


def resolve_target_names(
    promo: PromotionDTO,
    *,
    product_names_map: dict[str, str],
    category_names_map: dict[str, str],
) -> tuple[list[str], list[str]]:
    products = [
        product_names_map[str(product_id)]
        for product_id in promo.product_ids
        if str(product_id) in product_names_map
    ]
    categories = [
        category_names_map[str(category_id)]
        for category_id in promo.category_ids
        if str(category_id) in category_names_map
    ]
    return products, categories
