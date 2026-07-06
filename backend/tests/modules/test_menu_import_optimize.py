from app.modules.assistant.skills.menu_import.draft_schema import ImportCategory, ImportDraft, ImportProduct
from app.modules.assistant.skills.menu_import.optimization import parse_optimization_response


def test_import_category_accepts_display_layout():
    cat = ImportCategory(
        ref="cat_1",
        name="Alitas",
        sort_order=1,
        display_layout="grid",
        products=[],
    )
    assert cat.display_layout == "grid"


def test_import_product_accepts_sort_order():
    prod = ImportProduct(ref="p1", name="Boneless", sort_order=3, price_mxn=199)
    assert prod.sort_order == 3


def test_parse_optimization_response_merges_layout_and_complements():
    base = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Alitas",
                products=[
                    ImportProduct(
                        ref="p1",
                        name="Boneless",
                        price_mxn=199,
                        option_groups=[
                            {
                                "ref": "og_1",
                                "title": "Tamaño",
                                "selection": "single",
                                "required": False,
                                "min_selections": 0,
                                "max_selections": 1,
                                "items": [{"ref": "oi_1", "label": "Grande", "price_delta_mxn": 0}],
                            }
                        ],
                    )
                ],
            )
        ]
    )
    raw = {
        "categories": [
            {
                "ref": "cat_1",
                "sort_order": 0,
                "display_layout": "grid",
                "products": [
                    {
                        "ref": "p1",
                        "sort_order": 0,
                        "description": "Crujientes con salsa.",
                        "option_groups": [
                            {
                                "ref": "og_1",
                                "required": True,
                                "selection": "single",
                                "min_selections": 1,
                                "max_selections": 1,
                            }
                        ],
                    }
                ],
            }
        ],
        "optimization_notes_es": ["Tamaño obligatorio en boneless"],
        "recommended_theme_id": "original",
    }
    result = parse_optimization_response(base, raw)
    group = result.draft.categories[0].products[0].option_groups[0]
    assert result.draft.categories[0].display_layout == "grid"
    assert group.required is True
    assert group.min_selections == 1
    assert group.max_selections == 1
    assert result.optimization_notes_es == ["Tamaño obligatorio en boneless"]
