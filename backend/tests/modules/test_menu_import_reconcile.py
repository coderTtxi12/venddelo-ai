from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportProduct,
)
from app.modules.assistant.skills.menu_import.menu_reconcile import (
    build_reconciliation_plan,
    normalize_name,
)
from app.modules.menu.schemas import (
    CategoryDTO,
    FullMenuDTO,
    OptionGroupDTO,
    ProductDTO,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _category_dto(name: str) -> CategoryDTO:
    return CategoryDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name=name,
        sort_index=0,
        is_active=True,
        created_at=_now(),
        updated_at=_now(),
    )


def _product_dto(name: str, *, with_group: bool = False) -> ProductDTO:
    groups: list[OptionGroupDTO] = []
    if with_group:
        groups.append(
            OptionGroupDTO(
                id=uuid.uuid4(),
                product_id=uuid.uuid4(),
                title="Tamaño",
                required=True,
                selection="single",
                min_selections=1,
                max_selections=1,
                sort_index=0,
                is_active=True,
                items=[],
            )
        )
    return ProductDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name=name,
        price_cents=1000,
        currency="MXN",
        status="active",
        created_at=_now(),
        updated_at=_now(),
        option_groups=groups,
    )


def test_normalize_name_strips_accents_and_case() -> None:
    assert normalize_name("  Pizzería  ARTESANAL ") == "pizzeria artesanal"


def test_empty_menu_marks_everything_new() -> None:
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Tacos",
                products=[ImportProduct(ref="prod_1", name="Taco al pastor", price_mxn=25)],
            )
        ]
    )
    current = FullMenuDTO(restaurant_id=uuid.uuid4(), categories=[], products=[])

    plan = build_reconciliation_plan(draft, current)

    assert plan.new_categories == 1
    assert plan.new_products == 1
    assert plan.reused_categories == 0
    assert plan.updated_products == 0
    assert plan.category_matches == {}
    assert plan.product_matches == {}


def test_existing_menu_matches_by_normalized_name() -> None:
    existing_cat = _category_dto("Tacos")
    existing_prod = _product_dto("Taco al Pastor", with_group=True)
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="TACOS",
                products=[
                    ImportProduct(
                        ref="prod_1",
                        name="taco al pastor",
                        price_mxn=30,
                        option_groups=[ImportOptionGroup(ref="og_1", title="Salsa")],
                    ),
                    ImportProduct(ref="prod_2", name="Quesadilla", price_mxn=40),
                ],
            )
        ]
    )
    current = FullMenuDTO(
        restaurant_id=uuid.uuid4(),
        categories=[existing_cat],
        products=[existing_prod],
    )

    plan = build_reconciliation_plan(draft, current)

    assert plan.reused_categories == 1
    assert plan.new_categories == 0
    assert plan.updated_products == 1
    assert plan.new_products == 1
    assert plan.category_matches["cat_1"] == str(existing_cat.id)
    assert plan.product_matches["prod_1"] == str(existing_prod.id)
    assert plan.category_id_for("cat_1") == existing_cat.id
    assert plan.product_id_for("prod_1") == existing_prod.id
    assert plan.product_id_for("prod_2") is None
    # existing product already had option groups → do not duplicate complements
    assert "prod_1" in plan.products_with_existing_groups
    assert "Plan de importación" in plan.markdown
