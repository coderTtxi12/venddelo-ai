from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportCategory,
    ImportDraft,
    ImportProduct,
)
from app.modules.assistant.skills.menu_import.merchandising import apply_import_merchandising


def test_new_beverage_category_gets_grid_layout():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(
                ref="c_bebidas",
                name="Bebidas",
                products=[
                    ImportProduct(ref="p1", name="Coca-Cola 350 ml", price_mxn=25),
                    ImportProduct(ref="p2", name="Agua 500 ml", price_mxn=20),
                ],
            )
        ],
    )
    result = apply_import_merchandising(batch, new_category_refs=frozenset({"c_bebidas"}))
    assert result.categories[0].display_layout == "grid"


def test_promo_category_gets_horizontal_layout():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(
                ref="c_promos",
                name="Combos destacados",
                products=[
                    ImportProduct(ref="p1", name="Combo 1", price_mxn=199),
                    ImportProduct(ref="p2", name="Combo 2", price_mxn=249),
                    ImportProduct(ref="p3", name="Combo 3", price_mxn=279),
                ],
            )
        ],
    )
    result = apply_import_merchandising(batch, new_category_refs=frozenset({"c_promos"}))
    assert result.categories[0].display_layout == "horizontal"


def test_large_category_gets_vertical_layout():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(
                ref="c_tacos",
                name="Tacos",
                products=[
                    ImportProduct(ref=f"p{i}", name=f"Taco {i}", price_mxn=30 + i)
                    for i in range(8)
                ],
            )
        ],
    )
    result = apply_import_merchandising(batch, new_category_refs=frozenset({"c_tacos"}))
    assert result.categories[0].display_layout == "vertical"


def test_existing_category_keeps_layout_unset():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(
                ref="c1",
                name="Bebidas",
                display_layout=None,
                products=[ImportProduct(ref="p1", name="Coca-Cola", price_mxn=25)],
            )
        ],
    )
    result = apply_import_merchandising(batch, new_category_refs=frozenset())
    assert result.categories[0].display_layout is None


def test_category_order_puts_promos_before_drinks():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(ref="c_drinks", name="Bebidas", products=[]),
            ImportCategory(ref="c_promos", name="Promociones", products=[]),
            ImportCategory(ref="c_tacos", name="Tacos", products=[]),
        ],
    )
    result = apply_import_merchandising(batch, new_category_refs=frozenset({"c_drinks", "c_promos", "c_tacos"}))
    names = [category.name for category in result.categories]
    assert names.index("Promociones") < names.index("Tacos") < names.index("Bebidas")


def test_product_order_puts_combo_and_premium_first():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(
                ref="c1",
                name="Hamburguesas",
                products=[
                    ImportProduct(ref="p1", name="Clásica", price_mxn=120),
                    ImportProduct(ref="p2", name="Combo Premium", price_mxn=199),
                    ImportProduct(ref="p3", name="Doble BBQ", price_mxn=180),
                ],
            )
        ],
    )
    result = apply_import_merchandising(batch, new_category_refs=frozenset({"c1"}))
    names = [product.name for product in result.categories[0].products]
    assert names[0] == "Combo Premium"
    assert names[1] == "Doble BBQ"


def test_complement_groups_order_required_before_extras():
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
                                "ref": "og_extras",
                                "title": "Extras",
                                "required": False,
                                "selection": "multi",
                                "items": [{"ref": "oi1", "label": "Queso"}],
                            },
                            {
                                "ref": "og_size",
                                "title": "Elige tamaño",
                                "required": True,
                                "selection": "single",
                                "items": [{"ref": "oi2", "label": "Grande"}],
                            },
                        ],
                    )
                ],
            )
        ]
    )
    batch = ImportBatch(batch_index=0, categories=draft.categories)
    result = apply_import_merchandising(batch, new_category_refs=frozenset({"c1"}))
    titles = [group.title for group in result.categories[0].products[0].option_groups]
    assert titles[0] == "Elige tamaño"
    assert titles[-1] == "Extras"
