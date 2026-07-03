"""Build appetizing food-photography prompts from product context."""

from __future__ import annotations

from typing import Any


def _active_option_labels(context: dict[str, Any]) -> list[str]:
    labels: list[str] = []
    for group in context.get("option_groups") or []:
        if group.get("is_active") is False:
            continue
        title = (group.get("title") or "").strip()
        for item in group.get("items") or []:
            if item.get("is_active") is False:
                continue
            label = (item.get("label") or "").strip()
            if not label:
                continue
            labels.append(f"{title}: {label}" if title else label)
    return labels


def _promotion_hints(context: dict[str, Any]) -> list[str]:
    hints: list[str] = []
    for promo in (context.get("promotions") or [])[:4]:
        name = (promo.get("name") or "").strip()
        promo_type = (promo.get("type") or "").strip()
        if name:
            hints.append(f"{name} ({promo_type})" if promo_type else name)
    return hints


def build_food_image_prompt(context: dict[str, Any], *, style_notes: str | None = None) -> str:
    """Compose an English prompt tuned for menu-quality food photography."""
    name = (context.get("name") or "restaurant dish").strip()
    description = (context.get("description") or "").strip()
    category_names = context.get("category_names") or []
    restaurant_name = (context.get("restaurant_name") or "").strip()

    parts: list[str] = [f"Professional appetizing food photography of {name}."]

    if restaurant_name:
        parts.append(f"From {restaurant_name} restaurant menu.")
    if category_names:
        parts.append(f"Menu category: {', '.join(category_names)}.")
    if description:
        parts.append(f"Dish description: {description}.")

    option_labels = _active_option_labels(context)
    if option_labels:
        parts.append(
            "Optional add-ons or toppings that may appear as garnish: "
            + "; ".join(option_labels[:12])
            + "."
        )

    promo_hints = _promotion_hints(context)
    if promo_hints:
        parts.append(
            "Promotional context (do not render as text or badges): "
            + ", ".join(promo_hints)
            + "."
        )

    parts.append(
        "Style: high-end digital menu photo, warm natural lighting, shallow depth of field, "
        "clean neutral background, fresh ingredients, ultra photorealistic and as realistic as "
        "possible, mouth-watering, perfectly cooked and appetizing, shot by a professional "
        "food photographer, no text, no logos, no watermarks, no people, no hands, no "
        "packaging, no collage."
    )

    if style_notes and style_notes.strip():
        parts.append(f"Additional direction: {style_notes.strip()}.")

    return " ".join(parts)
