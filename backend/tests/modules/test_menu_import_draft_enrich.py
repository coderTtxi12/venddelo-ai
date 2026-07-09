from app.modules.assistant.skills.menu_import.draft_enrich import enrich_import_draft
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportProduct,
    ImportPromotion,
    PromotionBundle,
)


def test_enrich_import_draft_fills_catalog_discount_label():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Alitas",
                products=[
                    ImportProduct(
                        ref="prod_1",
                        name="8 piezas",
                        price_mxn=125,
                        catalog_discount={"type": "percent", "percent": 15},
                    )
                ],
            )
        ]
    )

    enriched = enrich_import_draft(draft)
    product = enriched.categories[0].products[0]
    assert product.has_catalog_discount is True
    assert product.catalog_discount is not None
    assert product.catalog_discount.label == "-15%"


def test_enrich_import_draft_fills_nxm_complement_lists():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Alitas",
                products=[
                    ImportProduct(
                        ref="prod_1",
                        name="8 piezas",
                        price_mxn=125,
                        option_groups=[
                            {
                                "ref": "og_1",
                                "title": "Sabor",
                                "items": [
                                    {"ref": "oi_1", "label": "BBQ"},
                                    {"ref": "oi_2", "label": "Búfalo"},
                                ],
                            }
                        ],
                    )
                ],
            )
        ],
        promotions=[
            ImportPromotion(
                ref="promo_1",
                name="2×1 Alitas",
                type="two_for_one",
                bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
                target_product_refs=["prod_1"],
                eligible_option_item_refs=["oi_1"],
            )
        ],
    )

    enriched = enrich_import_draft(draft)
    promo = enriched.promotions[0]
    assert promo.is_nxm is True
    assert promo.label == "2×1"
    assert [item.ref for item in promo.participating_complements] == ["oi_1"]
    assert [item.ref for item in promo.excluded_complements] == ["oi_2"]
    assert promo.participating_complements[0].product_name == "8 piezas"


def test_max_selections_null_preserved_in_draft():
    draft = ImportDraft.model_validate(
        {
            "categories": [
                {
                    "ref": "cat_1",
                    "name": "Extras",
                    "products": [
                        {
                            "ref": "prod_1",
                            "name": "Taco",
                            "option_groups": [
                                {
                                    "ref": "og_1",
                                    "title": "Adicionales",
                                    "selection": "multi",
                                    "max_selections": None,
                                    "items": [{"ref": "oi_1", "label": "Queso"}],
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )
    group = draft.categories[0].products[0].option_groups[0]
    assert group.max_selections is None
