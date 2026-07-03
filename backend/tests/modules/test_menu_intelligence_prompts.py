from app.modules.assistant.skills.menu_intelligence.prompts import build_complement_suggestion_prompt


def test_complement_prompt_states_new_items_only():
    prompt = build_complement_suggestion_prompt(
        {"name": "HAMBURGUESA", "existing_option_groups": []},
        image_analysis={"visible_add_on_ideas": ["bacon"]},
        peer_patterns=[],
        beverage_hints=[{"name": "Coca-Cola", "price_cents": 2500}],
    )
    assert "NEW complement" in prompt
    assert "never links to other product IDs" in prompt
    assert "Coca-Cola" in prompt
