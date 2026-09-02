from __future__ import annotations

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.modules.coupons.pricing import (
    COUPON_ERROR_MESSAGES,
    CouponInput,
    compose_quote_coupon,
)
from app.modules.menu.schemas import ProductDTO
from app.modules.promotions.pricing import PricedCartLine

_NOW = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
_TZ = ZoneInfo("America/Mexico_City")


def _product() -> ProductDTO:
    return ProductDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="Pizza",
        description=None,
        price_cents=10000,
        currency="MXN",
        image_path=None,
        status="active",
        created_at=_NOW,
        updated_at=_NOW,
        category_ids=[],
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
        expires_on=None,
        is_active=True,
        redemption_count=0,
        recurrence_weekdays=None,
        starts_on=None,
    )
    data.update(overrides)
    return CouponInput(**data)


def test_compose_valid_percent_lowers_food_total():
    product = _product()
    result = compose_quote_coupon(
        lines=[_line(product.id, 10000)],
        products_by_id={product.id: product},
        coupon=_coupon(),
        coupon_code="PIZZA20",
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=0,
        now_utc=_NOW,
        tz=_TZ,
    )
    assert result.coupon is not None
    assert result.coupon.code == "PIZZA20"
    assert result.coupon.type == "percent"
    assert result.coupon.discount_cents == 2000
    assert result.food_total_cents == 8000
    assert result.coupon_error is None


def test_compose_missing_coupon_returns_not_found_without_changing_totals():
    product = _product()
    result = compose_quote_coupon(
        lines=[_line(product.id, 10000)],
        products_by_id={product.id: product},
        coupon=None,
        coupon_code="NOPE",
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=5000,
        now_utc=_NOW,
        tz=_TZ,
    )
    assert result.coupon is None
    assert result.coupon_error is not None
    assert result.coupon_error.code == "coupon_not_found"
    assert result.coupon_error.message == COUPON_ERROR_MESSAGES["coupon_not_found"]
    assert result.food_total_cents == 10000
    assert result.delivery_fee_cents == 5000


def test_compose_free_shipping_takeout_returns_delivery_only():
    product = _product()
    result = compose_quote_coupon(
        lines=[_line(product.id, 10000)],
        products_by_id={product.id: product},
        coupon=_coupon(type="free_shipping", percent=None, amount_cents=None),
        coupon_code="FREESHIP",
        food_total_cents=10000,
        service_type="takeout",
        delivery_fee_cents=4500,
        now_utc=_NOW,
        tz=_TZ,
    )
    assert result.coupon is None
    assert result.coupon_error is not None
    assert result.coupon_error.code == "coupon_delivery_only"
    assert result.coupon_error.message == COUPON_ERROR_MESSAGES["coupon_delivery_only"]
    assert result.food_total_cents == 10000
    assert result.delivery_fee_cents == 4500


def test_compose_errors_do_not_raise():
    product = _product()
    result = compose_quote_coupon(
        lines=[_line(product.id, 10000)],
        products_by_id={product.id: product},
        coupon=None,
        coupon_code="BAD",
        food_total_cents=10000,
        service_type=None,
        delivery_fee_cents=0,
        now_utc=_NOW,
        tz=_TZ,
    )
    assert result.coupon_error is not None
