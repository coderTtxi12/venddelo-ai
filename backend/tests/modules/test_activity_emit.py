from app.modules.assistant.agent.activity_emit import (
    goal_for_call,
    normalize_llm_reasoning,
    plan_steps_for_calls,
)


def test_goal_for_call_includes_product_name():
    goal = goal_for_call(
        "menu_write__update_product",
        {"name": "HAMBURGUESA", "price_cents": 10000},
    )
    assert "HAMBURGUESA" in goal


def test_plan_steps_for_multiple_calls():
    steps = plan_steps_for_calls(
        [
            {
                "function": {
                    "name": "menu_read__search_products",
                    "arguments": '{"query":"Hamburguesa"}',
                }
            },
            {
                "function": {
                    "name": "menu_write__update_product",
                    "arguments": '{"name":"HAMBURGUESA","price_cents":10000}',
                }
            },
        ]
    )
    assert len(steps) == 2
    assert steps[0]["status"] == "pending"
    assert "Hamburguesa" in steps[0]["goal"]


def test_normalize_llm_reasoning_keeps_up_to_two_sentences():
    text = normalize_llm_reasoning(
        "Voy a listar el menú. Luego revisaré precios. Después daré recomendaciones."
    )
    assert text == "Voy a listar el menú. Luego revisaré precios."
