from app.modules.assistant.skills.menu_import.draft_schema import ImportProduct
from app.modules.assistant.skills.menu_import.price_units import mxn_to_cents


def test_mxn_to_cents():
    assert mxn_to_cents(229) == 22900
    assert mxn_to_cents(85.5) == 8550


def test_import_product_accepts_price_mxn():
    product = ImportProduct.model_validate(
        {"ref": "prod_1", "name": "Taco", "price_mxn": 229, "currency": "MXN"}
    )
    assert product.price_mxn == 229
    assert product.price_cents == 22900


def test_import_product_legacy_price_cents_field():
    product = ImportProduct.model_validate(
        {"ref": "prod_1", "name": "Taco", "price_cents": 8500, "currency": "MXN"}
    )
    assert product.price_mxn == 85
    assert product.price_cents == 8500


def test_import_product_null_price_mxn_defaults_to_zero():
    product = ImportProduct.model_validate(
        {"ref": "prod_1", "name": "Combo sin precio", "price_mxn": None, "currency": "MXN"}
    )
    assert product.price_mxn == 0
    assert product.price_cents == 0
