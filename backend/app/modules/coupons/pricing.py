from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.modules.menu.schemas import ProductDTO
from app.modules.promotions.pricing import PricedCartLine

COUPON_ERROR_MESSAGES = {
    "coupon_not_found": "Código no válido",
    "coupon_inactive": "Este cupón no está activo",
    "coupon_expired": "Este cupón expiró",
    "coupon_sold_out": "Este cupón ya no tiene existencias",
    "coupon_not_applicable": "Este cupón no aplica a los productos de tu carrito",
    "coupon_delivery_only": "Este cupón es solo para envío a domicilio",
    "coupon_wrong_day": "Este cupón no aplica hoy",
    "coupon_not_started": "Este cupón aún no está vigente",
}

_WEEKDAY_NAMES_ES = [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
]


def format_weekday_list_es(weekdays: list[int]) -> str:
    names = [_WEEKDAY_NAMES_ES[day] for day in sorted(weekdays) if 0 <= day <= 6]
    if not names:
        return ""
    if len(names) == 1:
        return f"el {names[0]}"
    if len(names) == 2:
        return f"los {names[0]} y {names[1]}"
    return f"los {', '.join(names[:-1])} y {names[-1]}"


def coupon_not_started_message(starts_on: date) -> str:
    formatted = starts_on.strftime("%d/%m/%Y")
    return f"Este cupón inicia el {formatted}"


def coupon_wrong_day_message(weekdays: list[int]) -> str:
    days = format_weekday_list_es(weekdays)
    if not days:
        return COUPON_ERROR_MESSAGES["coupon_wrong_day"]
    return f"Este cupón solo aplica {days}"


@dataclass(frozen=True)
class CouponInput:
    id: uuid.UUID
    code: str
    type: str
    percent: int | None
    amount_cents: int | None
    scope: str
    product_ids: list[uuid.UUID]
    category_ids: list[uuid.UUID]
    stock_qty: int | None
    starts_on: date | None
    expires_on: date | None
    recurrence_weekdays: list[int] | None
    is_active: bool
    redemption_count: int


@dataclass(frozen=True)
class QuoteCouponFields:
    code: str
    type: str
    discount_cents: int
    waived_delivery_cents: int


@dataclass(frozen=True)
class QuoteCouponErrorFields:
    code: str
    message: str


@dataclass(frozen=True)
class QuoteCouponComposeResult:
    food_total_cents: int
    delivery_fee_cents: int
    coupon: QuoteCouponFields | None = None
    coupon_error: QuoteCouponErrorFields | None = None


@dataclass(frozen=True)
class CouponApplyResult:
    ok: bool
    error_code: str | None
    error_message: str | None
    coupon_id: uuid.UUID | None
    code: str | None
    type: str | None
    discount_cents: int
    waived_delivery_cents: int
    food_total_cents: int
    delivery_fee_cents: int


def compose_quote_coupon(
    *,
    lines: list[PricedCartLine],
    products_by_id: dict[uuid.UUID, ProductDTO],
    coupon: CouponInput | None,
    coupon_code: str | None,
    food_total_cents: int,
    service_type: str | None,
    delivery_fee_cents: int,
    now_utc: datetime,
    tz: ZoneInfo,
) -> QuoteCouponComposeResult:
    delivery_fee = max(delivery_fee_cents, 0)
    food_total = food_total_cents
    code = normalize_coupon_code(coupon_code)
    if code is None:
        return QuoteCouponComposeResult(
            food_total_cents=food_total,
            delivery_fee_cents=delivery_fee,
        )
    applied = apply_coupon(
        lines=lines,
        products_by_id=products_by_id,
        coupon=coupon,
        food_total_cents=food_total,
        service_type=service_type,
        delivery_fee_cents=delivery_fee,
        now_utc=now_utc,
        tz=tz,
    )
    if applied.ok:
        return QuoteCouponComposeResult(
            food_total_cents=applied.food_total_cents,
            delivery_fee_cents=applied.delivery_fee_cents,
            coupon=QuoteCouponFields(
                code=applied.code or code,
                type=applied.type or "",
                discount_cents=applied.discount_cents,
                waived_delivery_cents=applied.waived_delivery_cents,
            ),
        )
    return QuoteCouponComposeResult(
        food_total_cents=applied.food_total_cents,
        delivery_fee_cents=applied.delivery_fee_cents,
        coupon_error=QuoteCouponErrorFields(
            code=applied.error_code or "coupon_not_found",
            message=applied.error_message or COUPON_ERROR_MESSAGES["coupon_not_found"],
        ),
    )


def normalize_coupon_code(raw: str | None) -> str | None:
    if raw is None:
        return None
    code = "".join(raw.split()).upper()
    return code or None


def _fail(
    code: str,
    food_total_cents: int,
    delivery_fee_cents: int,
    *,
    message: str | None = None,
) -> CouponApplyResult:
    return CouponApplyResult(
        ok=False,
        error_code=code,
        error_message=message or COUPON_ERROR_MESSAGES[code],
        coupon_id=None,
        code=None,
        type=None,
        discount_cents=0,
        waived_delivery_cents=0,
        food_total_cents=food_total_cents,
        delivery_fee_cents=delivery_fee_cents,
    )


def _line_eligible(coupon: CouponInput, product: ProductDTO | None) -> bool:
    if product is None:
        return False
    if coupon.scope == "all":
        return True
    if coupon.scope == "product":
        return product.id in coupon.product_ids
    if coupon.scope == "category":
        allowed = set(coupon.category_ids)
        return any(cid in allowed for cid in product.category_ids)
    return False


def apply_coupon(
    *,
    lines: list[PricedCartLine],
    products_by_id: dict[uuid.UUID, ProductDTO],
    coupon: CouponInput | None,
    food_total_cents: int,
    service_type: str | None,
    delivery_fee_cents: int,
    now_utc: datetime,
    tz: ZoneInfo,
) -> CouponApplyResult:
    if coupon is None:
        return CouponApplyResult(
            ok=False,
            error_code="coupon_not_found",
            error_message=COUPON_ERROR_MESSAGES["coupon_not_found"],
            coupon_id=None,
            code=None,
            type=None,
            discount_cents=0,
            waived_delivery_cents=0,
            food_total_cents=food_total_cents,
            delivery_fee_cents=delivery_fee_cents,
        )
    if not coupon.is_active:
        return _fail("coupon_inactive", food_total_cents, delivery_fee_cents)
    aware = now_utc if now_utc.tzinfo else now_utc.replace(tzinfo=UTC)
    local = aware.astimezone(tz)
    local_day = local.date()
    if coupon.starts_on is not None and local_day < coupon.starts_on:
        return _fail(
            "coupon_not_started",
            food_total_cents,
            delivery_fee_cents,
            message=coupon_not_started_message(coupon.starts_on),
        )
    if coupon.expires_on is not None and local_day > coupon.expires_on:
        return _fail("coupon_expired", food_total_cents, delivery_fee_cents)
    weekdays = coupon.recurrence_weekdays or []
    if weekdays and local.weekday() not in weekdays:
        return _fail(
            "coupon_wrong_day",
            food_total_cents,
            delivery_fee_cents,
            message=coupon_wrong_day_message(weekdays),
        )
    if coupon.stock_qty is not None and coupon.redemption_count >= coupon.stock_qty:
        return _fail("coupon_sold_out", food_total_cents, delivery_fee_cents)
    eligible = 0
    for line in lines:
        if _line_eligible(coupon, products_by_id.get(line.product_id)):
            eligible += line.line_total_cents
    if eligible <= 0:
        return _fail("coupon_not_applicable", food_total_cents, delivery_fee_cents)
    if coupon.type == "free_shipping":
        if service_type != "delivery":
            return _fail("coupon_delivery_only", food_total_cents, delivery_fee_cents)
        return CouponApplyResult(
            ok=True,
            error_code=None,
            error_message=None,
            coupon_id=coupon.id,
            code=coupon.code,
            type=coupon.type,
            discount_cents=0,
            waived_delivery_cents=max(delivery_fee_cents, 0),
            food_total_cents=food_total_cents,
            delivery_fee_cents=0,
        )
    if coupon.type == "percent" and coupon.percent is not None:
        discount = round(eligible * coupon.percent / 100)
    elif coupon.type == "amount" and coupon.amount_cents is not None:
        discount = min(coupon.amount_cents, eligible)
    else:
        discount = 0
    discount = max(0, min(discount, food_total_cents))
    return CouponApplyResult(
        ok=True,
        error_code=None,
        error_message=None,
        coupon_id=coupon.id,
        code=coupon.code,
        type=coupon.type,
        discount_cents=discount,
        waived_delivery_cents=0,
        food_total_cents=food_total_cents - discount,
        delivery_fee_cents=delivery_fee_cents,
    )
