from app.modules.assistant.skills.menu_media.prompt import build_food_image_prompt


def test_build_food_image_prompt_includes_name_description_and_style():
    prompt = build_food_image_prompt(
        {
            "name": "Tacos al pastor",
            "description": "Tres tacos con piña y cilantro",
            "category_names": ["Tacos"],
            "restaurant_name": "Taquería Demo",
            "option_groups": [
                {
                    "title": "Salsa",
                    "is_active": True,
                    "items": [
                        {"label": "Verde", "is_active": True},
                        {"label": "Roja", "is_active": True},
                    ],
                }
            ],
            "promotions": [{"name": "2x1 martes", "type": "bundle"}],
        },
        style_notes="top-down angle",
    )

    assert "Tacos al pastor" in prompt
    assert "Tres tacos con piña y cilantro" in prompt
    assert "Taquería Demo" in prompt
    assert "Verde" in prompt
    assert "2x1 martes" in prompt
    assert "top-down angle" in prompt
    assert "no text" in prompt.lower()


def test_build_food_image_prompt_skips_inactive_addons():
    prompt = build_food_image_prompt(
        {
            "name": "Burger",
            "option_groups": [
                {
                    "title": "Extras",
                    "is_active": True,
                    "items": [
                        {"label": "Queso", "is_active": True},
                        {"label": "Hidden", "is_active": False},
                    ],
                }
            ],
        }
    )

    assert "Queso" in prompt
    assert "Hidden" not in prompt
