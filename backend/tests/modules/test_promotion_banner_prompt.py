from app.modules.assistant.skills.promotions.banner_prompt import (
    PromotionBannerContext,
    build_promotion_banner_prompt,
    is_placeholder_promotion_banner,
)


def test_build_promotion_banner_prompt_includes_spanish_overlay_text():
    context = PromotionBannerContext(
        headline="HAMBURGUESAS",
        offer_label="2X1",
        hero_food="gourmet bacon cheeseburger with caramelized onions",
        restaurant_name="Burger House",
        cta_text="¡APROVECHA!",
        footer_text="Hamburguesas 2x1",
        show_countdown=True,
        countdown_hint="19:46:32",
    )
    prompt = build_promotion_banner_prompt(context)

    assert "HAMBURGUESAS" in prompt
    assert "2X1" in prompt
    assert "¡PROMO!" in prompt
    assert "¡APROVECHA!" in prompt
    assert "16:9" in prompt
    assert "countdown" in prompt.lower()


def test_is_placeholder_promotion_banner_detects_assistant_default():
    assert is_placeholder_promotion_banner(
        "restaurants/abc/assistant/promo-banner-placeholder.png",
        restaurant_id="abc",
    )
    assert is_placeholder_promotion_banner(None, restaurant_id="abc")
    assert not is_placeholder_promotion_banner(
        "restaurants/abc/promotions/real-banner.webp",
        restaurant_id="abc",
    )
