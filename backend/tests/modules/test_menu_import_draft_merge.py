from app.modules.assistant.skills.menu_import.draft_merge import merge_draft_batches
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportCategory, ImportProduct


def test_merge_draft_batches_combines_categories_and_keeps_promos_from_first_batch():
    batches = [
        ImportBatch(
            batch_index=0,
            categories=[
                ImportCategory(
                    ref="cat_1",
                    name="Tacos",
                    products=[ImportProduct(ref="p1", name="Pastor", price_mxn=35)],
                )
            ],
            promotions=[
                {
                    "ref": "promo_1",
                    "name": "2x1",
                    "type": "two_for_one",
                    "scope": "product",
                }
            ],
            global_rules=["Solo efectivo"],
            open_questions=[{"id": "q1", "question_es": "¿Horario?"}],
        ),
        ImportBatch(
            batch_index=1,
            categories=[
                ImportCategory(
                    ref="cat_2",
                    name="Bebidas",
                    products=[ImportProduct(ref="p2", name="Agua", price_mxn=20)],
                )
            ],
        ),
    ]
    draft = merge_draft_batches(batches)
    assert len(draft.categories) == 2
    assert draft.categories[0].name == "Tacos"
    assert draft.categories[1].name == "Bebidas"
    assert len(draft.promotions) == 1
    assert draft.global_rules == ["Solo efectivo"]
    assert len(draft.open_questions) == 1
