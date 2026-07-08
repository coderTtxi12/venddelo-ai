from app.modules.assistant.skills.menu_import.draft_schema import ImportCategory, ImportDraft, ImportProduct
from app.modules.assistant.skills.menu_import.preview_full import build_full_import_preview


def test_build_full_import_preview_includes_layout_complements_and_theme():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="c1",
                name="Alitas",
                sort_order=0,
                display_layout="grid",
                products=[
                    ImportProduct(
                        ref="p1",
                        name="Boneless",
                        price_mxn=199,
                        option_groups=[
                            {
                                "ref": "og_1",
                                "title": "Tamaño",
                                "required": True,
                                "selection": "single",
                                "min_selections": 1,
                                "max_selections": 1,
                                "items": [
                                    {"ref": "oi_1", "label": "Grande", "price_delta_mxn": 15}
                                ],
                            }
                        ],
                    )
                ],
            )
        ]
    )
    md = build_full_import_preview(draft)
    assert "Alitas" in md
    assert "grid" in md
    assert "Boneless" in md
    assert "$199" in md
    assert "obligatorio" in md
    assert "min=1" in md
    assert "Grande" in md
    assert "$15" in md
