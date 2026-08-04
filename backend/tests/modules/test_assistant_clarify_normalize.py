from app.modules.assistant.agent.workflow.clarify_normalize import (
    flatten_choice,
    normalize_clarify_choices,
)


def test_flatten_dict_label():
    assert flatten_choice({"label": " Efectivo "}) == "Efectivo"


def test_normalize_caps_at_four_and_drops_empty():
    raw = ["a", "b", "c", "d", "e", {"description": ""}]
    assert normalize_clarify_choices(raw) == ["a", "b", "c", "d"]


def test_normalize_empty_becomes_none():
    assert normalize_clarify_choices([]) is None
    assert normalize_clarify_choices(None) is None
