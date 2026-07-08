import pytest

from app.modules.assistant.skills.menu_import.draft_normalize import normalize_import_draft_payload
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft


def test_normalize_product_without_price_description_or_groups():
    payload = {
        "categories": [
            {
                "ref": "cat_1",
                "name": "Bebidas",
                "description": None,
                "products": [
                    {
                        "ref": "prod_1",
                        "name": "Agua",
                        "description": None,
                        "price_mxn": None,
                        "option_groups": None,
                        "constraints_notes": None,
                    }
                ],
            }
        ],
        "promotions": None,
        "global_rules": None,
        "unmapped_text": None,
        "open_questions": None,
    }

    draft = ImportDraft.model_validate(normalize_import_draft_payload(payload))

    product = draft.categories[0].products[0]
    assert product.description is None
    assert product.price_mxn == 0
    assert product.option_groups == []
    assert draft.promotions == []


def test_normalize_complement_without_price_delta():
    payload = {
        "categories": [
            {
                "ref": "cat_1",
                "name": "Tacos",
                "products": [
                    {
                        "ref": "prod_1",
                        "name": "Pastor",
                        "price_mxn": 35,
                        "option_groups": [
                            {
                                "ref": "og_1",
                                "title": "Salsa",
                                "required": None,
                                "items": [
                                    {"ref": "oi_1", "label": "Verde", "price_delta_mxn": None},
                                    {"ref": "oi_2", "label": "Roja", "price_delta_mxn": ""},
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }

    draft = ImportDraft.model_validate(normalize_import_draft_payload(payload))
    group = draft.categories[0].products[0].option_groups[0]
    assert group.required is False
    assert group.items[0].price_delta_mxn == 0
    assert group.items[1].price_delta_mxn == 0


def test_normalize_import_batch_payload():
    payload = {
        "batch_index": 0,
        "categories": None,
        "promotions": None,
        "global_rules": None,
        "open_questions": None,
    }

    batch = ImportBatch.model_validate(normalize_import_draft_payload(payload))
    assert batch.categories == []
    assert batch.promotions == []


@pytest.mark.parametrize(
    "raw,expected",
    [
        (None, 0),
        ("", 0),
        ("$129.50", 129.5),
    ],
)
def test_normalize_coerces_price_strings(raw, expected):
    payload = {
        "categories": [
            {
                "ref": "cat_1",
                "name": "Platillos",
                "products": [{"ref": "prod_1", "name": "Combo", "price_mxn": raw}],
            }
        ]
    }
    draft = ImportDraft.model_validate(normalize_import_draft_payload(payload))
    assert draft.categories[0].products[0].price_mxn == expected
