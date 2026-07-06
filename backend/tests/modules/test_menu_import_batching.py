from __future__ import annotations

from app.modules.assistant.skills.menu_import.batching import (
    count_batch_products,
    split_draft_into_batches,
)
from app.modules.assistant.skills.menu_import.draft_schema import ImportCategory, ImportDraft, ImportProduct


def _product(ref: str, name: str) -> ImportProduct:
    return ImportProduct(ref=ref, name=name, price_mxn=10)


def _category(ref: str, name: str, product_count: int) -> ImportCategory:
    products = [_product(f"{ref}_p{i}", f"{name} item {i}") for i in range(product_count)]
    return ImportCategory(ref=ref, name=name, products=products)


def test_split_37_products_into_three_batches():
    draft = ImportDraft(
        categories=[
            _category("cat_entradas", "Entradas", 10),
            _category("cat_platos", "Platos fuertes", 20),
            _category("cat_bebidas", "Bebidas", 7),
        ]
    )

    batches = split_draft_into_batches(draft, max_products=15)

    assert len(batches) == 3
    assert [count_batch_products(batch) for batch in batches] == [10, 15, 12]
    assert batches[0].categories[0].name == "Entradas"
    assert batches[1].categories[0].name == "Platos fuertes"
    assert batches[1].categories[0].products[0].name == "Platos fuertes item 0"
    assert batches[1].categories[0].products[-1].name == "Platos fuertes item 14"
    assert batches[2].categories[0].name == "Platos fuertes"
    assert batches[2].categories[0].ref.endswith("_2")
    assert batches[2].categories[-1].name == "Bebidas"


def test_split_prefers_whole_categories_when_possible():
    draft = ImportDraft(
        categories=[
            _category("cat_a", "A", 5),
            _category("cat_b", "B", 5),
            _category("cat_c", "C", 5),
        ]
    )
    batches = split_draft_into_batches(draft, max_products=15)
    assert len(batches) == 1
    assert count_batch_products(batches[0]) == 15
    assert len(batches[0].categories) == 3


def test_split_oversized_category_across_batches():
    draft = ImportDraft(categories=[_category("cat_big", "Big", 20)])
    batches = split_draft_into_batches(draft, max_products=15)
    assert len(batches) == 2
    assert [count_batch_products(batch) for batch in batches] == [15, 5]
    assert batches[0].categories[0].ref == "cat_big_1"
    assert batches[1].categories[0].ref == "cat_big_2"


def test_promotions_attached_to_first_batch_only():
    draft = ImportDraft(
        categories=[_category("cat_a", "A", 16)],
        global_rules=["rule"],
        open_questions=[],
    )
    batches = split_draft_into_batches(draft, max_products=15)
    assert len(batches) == 2
    assert batches[0].global_rules == ["rule"]
    assert batches[1].global_rules == []
