from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.modules.menu.schemas import OptionGroupDTO, OptionItemDTO, ProductDTO
from app.modules.promotions.pricing import CartLineInput, price_cart
from app.modules.promotions.schemas import PromotionDTO
from app.modules.promotions.effective import resolve_timezone


def _product(price_cents: int = 10000, category_ids: list[uuid.UUID] | None = None) -> ProductDTO:
    pid = uuid.uuid4()
    return ProductDTO(
        id=pid,
        restaurant_id=uuid.uuid4(),
        name="Pizza",
        description=None,
        price_cents=price_cents,
        currency="MXN",
        image_path=None,
        approval_status="approved",
        is_published=True,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        category_ids=category_ids or [],
        option_groups=[],
    )


def _bundle_promo(category_id: uuid.UUID) -> PromotionDTO:
    return PromotionDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="2x1 Pizzas",
        type="two_for_one",
        scope="category",
        percent=None,
        amount_cents=None,
        min_order_cents=None,
        starts_at=None,
        ends_at=None,
        bundle_get_quantity=2,
        bundle_pay_quantity=1,
        recurrence_weekdays=None,
        recurrence_start_time=None,
        recurrence_end_time=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=[],
        category_ids=[category_id],
        option_item_ids=[],
    )


def test_bundle_2x1_two_pizzas_one_free():
    cat_id = uuid.uuid4()
    product = _product(10000, [cat_id])
    promo = _bundle_promo(cat_id)
    tz = resolve_timezone("America/Mexico_City")
    now = datetime.now(UTC)

    quote = price_cart(
        lines=[CartLineInput(product_id=product.id, quantity=2)],
        products_by_id={product.id: product},
        promotions=[promo],
        now_utc=now,
        tz=tz,
    )

    assert quote.subtotal_before_discount_cents == 20000
    assert quote.lines[0].discount_cents == 10000
    assert quote.lines[0].line_total_cents == 10000
    assert quote.total_cents == 10000
    assert quote.lines[0].badge == "2×1"


def test_percent_line_discount():
    cat_id = uuid.uuid4()
    product = _product(10000, [cat_id])
    promo = PromotionDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="20% off",
        type="percent",
        scope="category",
        percent=20,
        amount_cents=None,
        min_order_cents=None,
        starts_at=None,
        ends_at=None,
        bundle_get_quantity=None,
        bundle_pay_quantity=None,
        recurrence_weekdays=None,
        recurrence_start_time=None,
        recurrence_end_time=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=[],
        category_ids=[cat_id],
        option_item_ids=[],
    )
    tz = resolve_timezone("America/Mexico_City")
    quote = price_cart(
        lines=[CartLineInput(product_id=product.id, quantity=1)],
        products_by_id={product.id: product},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )
    assert quote.lines[0].discount_cents == 2000
    assert quote.lines[0].line_total_cents == 8000


def test_waived_option_items_in_bundle():
    cat_id = uuid.uuid4()
    option_id = uuid.uuid4()
    product = _product(10000, [cat_id])
    product.option_groups = [
        OptionGroupDTO(
            id=uuid.uuid4(),
            product_id=product.id,
            title="Extras",
            required=False,
            selection="multi",
            min_selections=0,
            max_selections=None,
            sort_index=0,
            is_active=True,
            items=[
                OptionItemDTO(
                    id=option_id,
                    label="Queso",
                    price_delta_cents=2000,
                    sort_index=0,
                    is_active=True,
                )
            ],
        )
    ]
    promo = _bundle_promo(cat_id)

    tz = resolve_timezone("America/Mexico_City")
    quote = price_cart(
        lines=[
            CartLineInput(
                product_id=product.id,
                quantity=2,
                selected_options={str(product.option_groups[0].id): [str(option_id)]},
            )
        ],
        products_by_id={product.id: product},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )
    # Base 2x1: one base free; complementos con costo siempre se cobran en ambas unidades
    assert quote.lines[0].line_total_cents == 14000


def test_cross_product_category_2x1_charges_higher_base():
    cat_id = uuid.uuid4()
    cheap = _product(15000, [cat_id])
    cheap.name = "Pizza Margarita"
    expensive = _product(20000, [cat_id])
    expensive.name = "Pizza Especial"
    promo = _bundle_promo(cat_id)
    tz = resolve_timezone("America/Mexico_City")

    quote = price_cart(
        lines=[
            CartLineInput(product_id=cheap.id, quantity=1),
            CartLineInput(product_id=expensive.id, quantity=1),
        ],
        products_by_id={cheap.id: cheap, expensive.id: expensive},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )

    assert quote.subtotal_before_discount_cents == 35000
    assert quote.total_cents == 20000
    assert quote.lines[0].line_total_cents == 0
    assert quote.lines[0].discount_cents == 15000
    assert quote.lines[1].line_total_cents == 20000
    assert quote.lines[1].discount_cents == 0


def _product_scope_bundle_promo(product_ids: list[uuid.UUID]) -> PromotionDTO:
    return PromotionDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="2x1 selección",
        type="two_for_one",
        scope="product",
        percent=None,
        amount_cents=None,
        min_order_cents=None,
        starts_at=None,
        ends_at=None,
        bundle_get_quantity=2,
        bundle_pay_quantity=1,
        recurrence_weekdays=None,
        recurrence_start_time=None,
        recurrence_end_time=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=product_ids,
        category_ids=[],
        option_item_ids=[],
    )


def test_cross_product_scope_different_categories():
    cat_a, cat_b = uuid.uuid4(), uuid.uuid4()
    cheap = _product(15000, [cat_a])
    expensive = _product(20000, [cat_b])
    promo = _product_scope_bundle_promo([cheap.id, expensive.id])
    tz = resolve_timezone("America/Mexico_City")

    quote = price_cart(
        lines=[
            CartLineInput(product_id=cheap.id, quantity=1),
            CartLineInput(product_id=expensive.id, quantity=1),
        ],
        products_by_id={cheap.id: cheap, expensive.id: expensive},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )

    assert quote.total_cents == 20000


def test_cross_product_2x1_complements_always_charged():
    cat_id = uuid.uuid4()
    option_id = uuid.uuid4()
    cheap = _product(15000, [cat_id])
    expensive = _product(20000, [cat_id])
    group_id = uuid.uuid4()
    cheap.option_groups = [
        OptionGroupDTO(
            id=group_id,
            product_id=cheap.id,
            title="Extras",
            required=False,
            selection="multi",
            min_selections=0,
            max_selections=None,
            sort_index=0,
            is_active=True,
            items=[
                OptionItemDTO(
                    id=option_id,
                    label="Queso",
                    price_delta_cents=3000,
                    sort_index=0,
                    is_active=True,
                )
            ],
        )
    ]
    promo = _bundle_promo(cat_id)
    tz = resolve_timezone("America/Mexico_City")

    quote = price_cart(
        lines=[
            CartLineInput(
                product_id=cheap.id,
                quantity=1,
                selected_options={str(group_id): [str(option_id)]},
            ),
            CartLineInput(product_id=expensive.id, quantity=1),
        ],
        products_by_id={cheap.id: cheap, expensive.id: expensive},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )

    # Pizza barata: base gratis, complemento sí; pizza cara: base completa
    assert quote.total_cents == 23000
    assert quote.lines[0].line_total_cents == 3000
    assert quote.lines[1].line_total_cents == 20000


def test_same_product_bundle_does_not_mix_products():
    cat_id = uuid.uuid4()
    burger = _product(20000, [cat_id])
    burger.name = "Burger"
    wings = _product(15000, [cat_id])
    wings.name = "Wings"
    promo = _bundle_promo(cat_id)
    promo.bundle_pairing_mode = "same_product"
    promo.bundle = None
    tz = resolve_timezone("America/Mexico_City")

    quote = price_cart(
        lines=[
            CartLineInput(product_id=burger.id, quantity=1),
            CartLineInput(product_id=wings.id, quantity=1),
        ],
        products_by_id={burger.id: burger, wings.id: wings},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )

    assert quote.total_cents == 35000


def test_bundle_uses_catalog_discounted_base_for_pairing():
    cat_id = uuid.uuid4()
    product = _product(25900, [cat_id])
    catalog = PromotionDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="__product_discount__Burger",
        type="amount",
        scope="product",
        amount_cents=5900,
        percent=None,
        min_order_cents=None,
        starts_at=None,
        ends_at=None,
        bundle_get_quantity=None,
        bundle_pay_quantity=None,
        bundle_pairing_mode=None,
        recurrence_weekdays=None,
        recurrence_start_time=None,
        recurrence_end_time=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=[product.id],
        category_ids=[],
        option_item_ids=[],
    )
    cheap = _product(20000, [cat_id])
    promo = _bundle_promo(cat_id)
    tz = resolve_timezone("America/Mexico_City")

    quote = price_cart(
        lines=[
            CartLineInput(product_id=product.id, quantity=1),
            CartLineInput(product_id=cheap.id, quantity=1),
        ],
        products_by_id={product.id: product, cheap.id: cheap},
        promotions=[promo, catalog],
        now_utc=datetime.now(UTC),
        tz=tz,
    )

    assert quote.total_cents == 20000


def test_excluded_complement_disqualifies_bundle_line():
    cat_id = uuid.uuid4()
    option_allowed = uuid.uuid4()
    option_excluded = uuid.uuid4()
    product = _product(20000, [cat_id])
    group_id = uuid.uuid4()
    product.option_groups = [
        OptionGroupDTO(
            id=group_id,
            product_id=product.id,
            title="Salsa",
            required=False,
            selection="multi",
            min_selections=0,
            max_selections=None,
            sort_index=0,
            is_active=True,
            items=[
                OptionItemDTO(
                    id=option_allowed,
                    label="BBQ",
                    price_delta_cents=0,
                    sort_index=0,
                    is_active=True,
                ),
                OptionItemDTO(
                    id=option_excluded,
                    label="Habanero",
                    price_delta_cents=0,
                    sort_index=1,
                    is_active=True,
                ),
            ],
        )
    ]
    promo = _bundle_promo(cat_id)
    promo.option_item_ids = [option_allowed]
    tz = resolve_timezone("America/Mexico_City")

    quote = price_cart(
        lines=[
            CartLineInput(
                product_id=product.id,
                quantity=2,
                selected_options={str(group_id): [str(option_excluded)]},
            )
        ],
        products_by_id={product.id: product},
        promotions=[promo],
        now_utc=datetime.now(UTC),
        tz=tz,
    )

    assert quote.lines[0].line_total_cents == 40000
    assert quote.lines[0].badge is None
    assert quote.lines[0].promo_warnings == ["complement_excluded"]
