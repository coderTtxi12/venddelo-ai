from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.modules.coupons.pricing import CouponInput, apply_coupon, normalize_coupon_code
from app.modules.menu.schemas import ProductDTO
from app.modules.promotions.pricing import PricedCartLine


def _product(*, category_ids: list[uuid.UUID] | None = None) -> ProductDTO:
    return ProductDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="Pizza",
        description=None,
        price_cents=20000,
        currency="MXN",
        image_path=None,
        status="active",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        category_ids=category_ids or [],
        option_groups=[],
    )


def _line(product_id: uuid.UUID, line_total_cents: int) -> PricedCartLine:
    return PricedCartLine(
        product_id=product_id,
        quantity=1,
        unit_base_cents=line_total_cents,
        options_cents=0,
        discount_cents=0,
        line_total_cents=line_total_cents,
    )


def _coupon(**overrides) -> CouponInput:
    data = dict(
        id=uuid.uuid4(),
        code="PIZZA20",
        type="percent",
        percent=20,
        amount_cents=None,
        scope="all",
        product_ids=[],
        category_ids=[],
        stock_qty=None,
        starts_on=None,
        expires_on=None,
        is_active=True,
        redemption_count=0,
        recurrence_weekdays=None,
    )
    data.update(overrides)
    return CouponInput(**data)


def test_normalize_coupon_code_upper_and_trim():
    assert normalize_coupon_code("  pizza20 ") == "PIZZA20"
    assert normalize_coupon_code("pi zza 20") == "PIZZA20"
    assert normalize_coupon_code("") is None
    assert normalize_coupon_code(None) is None


def test_percent_only_on_eligible_category_after_promo_totals():
    cat = uuid.uuid4()
    pizza = _product(category_ids=[cat])
    drink = _product(category_ids=[uuid.uuid4()])
    coupon = _coupon(scope="category", category_ids=[cat], type="percent", percent=20)
    result = apply_coupon(
        lines=[_line(pizza.id, 10000), _line(drink.id, 4000)],
        products_by_id={pizza.id: pizza, drink.id: drink},
        coupon=coupon,
        food_total_cents=14000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is True
    assert result.discount_cents == 2000
    assert result.food_total_cents == 12000
    assert result.error_code is None


def test_amount_capped_at_eligible_subtotal():
    pizza = _product()
    coupon = _coupon(type="amount", percent=None, amount_cents=99999, scope="all")
    result = apply_coupon(
        lines=[_line(pizza.id, 1500)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=1500,
        service_type="delivery",
        delivery_fee_cents=5000,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is True
    assert result.discount_cents == 1500
    assert result.food_total_cents == 0


def test_free_shipping_pickup_is_delivery_only():
    pizza = _product()
    coupon = _coupon(type="free_shipping", percent=None, amount_cents=None)
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=4500,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is False
    assert result.error_code == "coupon_delivery_only"
    assert result.error_message == "Este cupón es solo para envío a domicilio"
    assert result.discount_cents == 0
    assert result.food_total_cents == 10000


def test_free_shipping_delivery_waives_fee():
    pizza = _product()
    coupon = _coupon(type="free_shipping", percent=None, amount_cents=None)
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="delivery",
        delivery_fee_cents=4500,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is True
    assert result.discount_cents == 0
    assert result.waived_delivery_cents == 4500
    assert result.delivery_fee_cents == 0
    assert result.food_total_cents == 10000


def test_sold_out_when_redemptions_meet_stock():
    pizza = _product()
    coupon = _coupon(stock_qty=2, redemption_count=2)
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is False
    assert result.error_code == "coupon_sold_out"
    assert result.error_message == "Este cupón ya no tiene existencias"


def test_expired_end_of_local_day():
    pizza = _product()
    coupon = _coupon(expires_on=date(2026, 8, 31))
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, 6, 0, tzinfo=UTC),  # 00:00 CDMX Sep 1
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is False
    assert result.error_code == "coupon_expired"


def test_inactive_and_not_applicable():
    pizza = _product()
    drink_cat = uuid.uuid4()
    drink = _product(category_ids=[drink_cat])
    inactive = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=_coupon(is_active=False),
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert inactive.error_code == "coupon_inactive"
    scoped = apply_coupon(
        lines=[_line(drink.id, 4000)],
        products_by_id={drink.id: drink},
        coupon=_coupon(scope="product", product_ids=[pizza.id]),
        food_total_cents=4000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert scoped.error_code == "coupon_not_applicable"
    assert scoped.error_message == "Este cupón no aplica a los productos de tu carrito"


def test_weekday_restriction_blocks_wrong_day():
    pizza = _product()
    coupon = _coupon(recurrence_weekdays=[0])  # Monday only
    # 2026-09-01 is a Tuesday in America/Mexico_City
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, 18, 0, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is False
    assert result.error_code == "coupon_wrong_day"
    assert result.error_message == "Este cupón solo aplica el lunes"


def test_starts_on_blocks_before_start_date():
    pizza = _product()
    coupon = _coupon(starts_on=date(2026, 9, 5))
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, 18, 0, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is False
    assert result.error_code == "coupon_not_started"
    assert result.error_message == "Este cupón inicia el 05/09/2026"


def test_starts_on_allows_on_or_after_start_date():
    pizza = _product()
    coupon = _coupon(recurrence_weekdays=[1])  # Tuesday
    result = apply_coupon(
        lines=[_line(pizza.id, 10000)],
        products_by_id={pizza.id: pizza},
        coupon=coupon,
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=datetime(2026, 9, 1, 18, 0, tzinfo=UTC),
        tz=ZoneInfo("America/Mexico_City"),
    )
    assert result.ok is True
    assert result.discount_cents == 2000
