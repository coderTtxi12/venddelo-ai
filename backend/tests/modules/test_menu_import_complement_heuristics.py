from app.modules.assistant.skills.menu_import.complement_heuristics import apply_complement_heuristics
from app.modules.assistant.skills.menu_import.draft_schema import ImportCategory, ImportDraft, ImportProduct


def test_apply_complement_heuristics_marks_size_as_required():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="c1",
                name="Alitas",
                products=[
                    ImportProduct(
                        ref="p1",
                        name="Boneless",
                        option_groups=[
                            {
                                "ref": "og1",
                                "title": "Elige tamaño",
                                "required": False,
                                "selection": "single",
                                "min_selections": 0,
                                "max_selections": 1,
                                "items": [
                                    {"ref": "oi1", "label": "Grande"},
                                    {"ref": "oi2", "label": "Mediano"},
                                ],
                            }
                        ],
                    )
                ],
            )
        ]
    )
    result = apply_complement_heuristics(draft)
    group = result.categories[0].products[0].option_groups[0]
    assert group.required is True
    assert group.min_selections == 1
    assert group.max_selections == 1


def test_apply_complement_heuristics_marks_extras_as_optional_multi():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="c1",
                name="Tacos",
                products=[
                    ImportProduct(
                        ref="p1",
                        name="Pastor",
                        option_groups=[
                            {
                                "ref": "og1",
                                "title": "Extras",
                                "required": True,
                                "selection": "single",
                                "min_selections": 1,
                                "max_selections": 1,
                                "items": [
                                    {"ref": "oi1", "label": "Queso"},
                                    {"ref": "oi2", "label": "Guacamole"},
                                    {"ref": "oi3", "label": "Tocino"},
                                ],
                            }
                        ],
                    )
                ],
            )
        ]
    )
    result = apply_complement_heuristics(draft)
    group = result.categories[0].products[0].option_groups[0]
    assert group.required is False
    assert group.selection == "multi"
    assert group.min_selections == 0
    assert group.max_selections is None
