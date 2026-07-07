import uuid
from datetime import UTC, datetime

from app.modules.assistant.skills.product_resolve import (
    normalize_product_query,
    resolve_product_in_catalog,
    score_product,
)
from app.modules.menu.schemas import ProductDTO


def _dto(name: str, *, description: str = "") -> ProductDTO:
    now = datetime.now(UTC)
    return ProductDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name=name,
        description=description,
        price_cents=1000,
        currency="MXN",
        status="active",
        category_ids=[],
        category_sort_indices={},
        option_groups=[],
        image_path=None,
        created_at=now,
        updated_at=now,
    )


def test_normalize_product_query_normalizes_text():
    assert normalize_product_query("  HAMBURGUESA  ") == "hamburguesa"


def test_resolve_prefers_exact_name_over_fuzzy_neighbor():
    hamburguesa = _dto("HAMBURGUESA")
    burger = _dto("BURGER & BONELESS")
    resolved = resolve_product_in_catalog("Hamburguesa", [burger, hamburguesa])
    assert resolved.status == "found"
    assert resolved.product is not None
    assert resolved.product.name == "HAMBURGUESA"


def test_resolve_burger_boneless_still_matches_burger_product():
    burger = _dto("BURGER & BONELESS")
    boneless_fries = _dto("BONELESS & FRIES WITC SAUCE")
    resolved = resolve_product_in_catalog("burger boneless", [burger, boneless_fries])
    assert resolved.status == "found"
    assert resolved.product is not None
    assert resolved.product.name == "BURGER & BONELESS"


def test_resolve_ignores_description_when_name_differs():
    hamburguesa = _dto("HAMBURGUESA")
    burger = _dto(
        "BURGER & BONELESS",
        description="Combo de hamburguesa con boneless",
    )
    resolved = resolve_product_in_catalog("Hamburguesa", [burger, hamburguesa])
    assert resolved.status == "found"
    assert resolved.product is not None
    assert resolved.product.name == "HAMBURGUESA"


def test_score_product_does_not_use_description():
    burger = _dto("BURGER & BONELESS", description="Deliciosa hamburguesa")
    assert score_product("hamburguesa", burger) < 0.7


def test_resolve_finds_inactive_product_by_exact_name():
    inactive = _dto("HAMBURGUESA")
    inactive = inactive.model_copy(update={"status": "inactive"})
    burger = _dto("BURGER & BONELESS")
    resolved = resolve_product_in_catalog("Hamburguesa", [burger, inactive])
    assert resolved.status == "found"
    assert resolved.product is not None
    assert resolved.product.name == "HAMBURGUESA"
    assert resolved.product.status == "inactive"


def test_resolve_active_only_still_finds_exact_inactive_name():
    wings = _dto("WINGS & FRIES")
    wings = wings.model_copy(update={"status": "inactive"})
    boneless = _dto("BONELESS & FRIES WITC SAUCE")
    resolved = resolve_product_in_catalog(
        "Wings & Fries",
        [boneless, wings],
        active_only=True,
    )
    assert resolved.status == "found"
    assert resolved.product is not None
    assert resolved.product.name == "WINGS & FRIES"
    assert resolved.matches == ((1.0, wings),)


def test_resolve_active_only_fuzzy_skips_inactive_neighbors():
    wings = _dto("WINGS & FRIES")
    wings = wings.model_copy(update={"status": "inactive"})
    boneless = _dto("BONELESS & FRIES WITC SAUCE")
    resolved = resolve_product_in_catalog(
        "wings and fries",
        [wings, boneless],
        active_only=True,
    )
    assert resolved.status == "found"
    assert resolved.product is not None
    assert resolved.product.name == "BONELESS & FRIES WITC SAUCE"
    assert resolved.matches[0][0] < 1.0
