from app.modules.assistant.skills.menu_import.draft_refs import ensure_unique_import_refs
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportOptionItem,
    ImportProduct,
    ImportPromotion,
    OpenQuestion,
)
from app.modules.assistant.skills.menu_import.extraction import merge_page_drafts


def test_ensure_unique_import_refs_renumbers_duplicate_category_and_product_refs():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="chunky cookies",
                products=[
                    ImportProduct(ref="prod_1", name="red velvet", price_mxn=50),
                    ImportProduct(ref="prod_2", name="limon", price_mxn=50),
                ],
            ),
            ImportCategory(
                ref="cat_1",
                name="bebidas frias",
                products=[
                    ImportProduct(ref="prod_1", name="cafe helado", price_mxn=45),
                    ImportProduct(
                        ref="prod_2",
                        name="leche fria",
                        price_mxn=25,
                        option_groups=[
                            ImportOptionGroup(
                                ref="og_1",
                                title="Tipo de leche",
                                items=[
                                    ImportOptionItem(ref="oi_1", label="normal"),
                                    ImportOptionItem(ref="oi_2", label="almendra"),
                                ],
                            )
                        ],
                    ),
                ],
            ),
        ],
        open_questions=[
            OpenQuestion(
                id="q_1",
                question_es="¿Leche?",
                related_refs=["prod_2"],
            )
        ],
    )

    result = ensure_unique_import_refs(draft)

    category_refs = [category.ref for category in result.categories]
    product_refs = [
        product.ref for category in result.categories for product in category.products
    ]
    option_group_refs = [
        group.ref
        for category in result.categories
        for product in category.products
        for group in product.option_groups
    ]
    option_item_refs = [
        item.ref
        for category in result.categories
        for product in category.products
        for group in product.option_groups
        for item in group.items
    ]

    assert category_refs == ["cat_1", "cat_2"]
    assert product_refs == ["prod_1", "prod_2", "prod_3", "prod_4"]
    assert option_group_refs == ["og_1"]
    assert option_item_refs == ["oi_1", "oi_2"]
    assert result.categories[0].products[0].name == "red velvet"
    assert result.categories[1].products[0].name == "cafe helado"
    # Second page's prod_2 was renumbered to prod_4; question still points at cookies prod_2
    # until we remap related_refs by occurrence — first prod_2 keeps related_refs.
    assert result.open_questions[0].related_refs == ["prod_2"]


def test_ensure_unique_import_refs_remaps_promotion_and_question_refs():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="A",
                products=[ImportProduct(ref="prod_1", name="one", price_mxn=10)],
            ),
            ImportCategory(
                ref="cat_1",
                name="B",
                products=[ImportProduct(ref="prod_1", name="two", price_mxn=20)],
            ),
        ],
        promotions=[
            ImportPromotion(
                ref="promo_1",
                name="Promo",
                type="percent",
                percent=10,
                target_product_refs=["prod_1"],
                target_category_refs=["cat_1"],
            )
        ],
        open_questions=[
            OpenQuestion(
                id="q_1",
                question_es="?",
                related_refs=["prod_1", "cat_1"],
            )
        ],
    )

    result = ensure_unique_import_refs(draft)

    assert result.categories[1].ref == "cat_2"
    assert result.categories[1].products[0].ref == "prod_2"
    # Promotions/questions that pointed at the first occurrence keep first-occurrence refs
    assert result.promotions[0].target_category_refs == ["cat_1"]
    assert result.promotions[0].target_product_refs == ["prod_1"]
    assert result.open_questions[0].related_refs == ["prod_1", "cat_1"]


def test_merge_page_drafts_renumbers_duplicate_refs_across_pages():
    page1 = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Postres",
                products=[ImportProduct(ref="prod_1", name="Cookie", price_mxn=50)],
            )
        ]
    )
    page2 = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Bebidas",
                products=[ImportProduct(ref="prod_1", name="Cafe", price_mxn=45)],
            )
        ]
    )

    merged = merge_page_drafts([page1, page2])

    assert [category.ref for category in merged.categories] == ["cat_1", "cat_2"]
    assert [product.ref for category in merged.categories for product in category.products] == [
        "prod_1",
        "prod_2",
    ]
