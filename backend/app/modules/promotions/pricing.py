from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.modules.menu.schemas import ProductDTO
from app.modules.promotions.effective import is_promotion_effective
from app.modules.promotions.schemas import PromotionDTO

CATALOG_DISCOUNT_PREFIX = "__product_discount__"
BUNDLE_PAIRING_CROSS = "cross_product"
BUNDLE_PAIRING_SAME = "same_product"
PROMO_WARNING_COMPLEMENT_EXCLUDED = "complement_excluded"


@dataclass
class CartLineInput:
    product_id: uuid.UUID
    quantity: int
    selected_options: dict[str, Any] | None = None


@dataclass
class PricedCartLine:
    product_id: uuid.UUID
    quantity: int
    unit_base_cents: int
    options_cents: int
    discount_cents: int
    line_total_cents: int
    badge: str | None = None
    applied_promotion_id: uuid.UUID | None = None
    promo_warnings: list[str] | None = None


@dataclass
class CartQuoteResult:
    lines: list[PricedCartLine]
    subtotal_before_discount_cents: int
    order_discount_cents: int
    total_cents: int
    applied_order_promotion_id: uuid.UUID | None = None


@dataclass
class _CartUnit:
    line_index: int
    product_id: uuid.UUID
    base_cents: int
    options_cents: int


def _selected_option_item_ids(selected_options: dict[str, Any] | None) -> list[uuid.UUID]:
    if not selected_options:
        return []
    ids: list[uuid.UUID] = []
    for raw_ids in selected_options.values():
        if not isinstance(raw_ids, list):
            continue
        for item_id in raw_ids:
            ids.append(uuid.UUID(str(item_id)))
    return ids


def _options_total_cents(
    product: ProductDTO,
    selected_options: dict[str, Any] | None,
    waived_option_ids: set[uuid.UUID],
) -> int:
    selected = set(_selected_option_item_ids(selected_options))
    total = 0
    for group in product.option_groups:
        if not group.is_active:
            continue
        for item in group.items:
            if not item.is_active:
                continue
            if item.id in selected:
                if item.id in waived_option_ids:
                    continue
                total += item.price_delta_cents
    return total


def _is_catalog_discount_promo(promo: PromotionDTO, product_id: uuid.UUID) -> bool:
    if promo.scope != "product":
        return False
    if promo.type not in ("percent", "amount"):
        return False
    if not promo.name.startswith(CATALOG_DISCOUNT_PREFIX):
        return False
    return product_id in promo.product_ids


def _discounted_base_cents(
    product: ProductDTO,
    promotions: list[PromotionDTO],
    now_utc: datetime,
    tz: ZoneInfo,
) -> int:
    base = product.price_cents
    best = base
    for promo in promotions:
        if not is_promotion_effective(promo, now_utc, tz):
            continue
        if not _is_catalog_discount_promo(promo, product.id):
            continue
        if promo.type == "percent" and promo.percent is not None:
            best = min(best, round(base * (100 - promo.percent) / 100))
        elif promo.type == "amount" and promo.amount_cents is not None:
            best = min(best, max(0, base - promo.amount_cents))
    return best


def _bundle_pairing_mode(promo: PromotionDTO) -> str:
    if promo.bundle is not None and promo.bundle.pairing_mode:
        return promo.bundle.pairing_mode
    if promo.bundle_pairing_mode:
        return promo.bundle_pairing_mode
    return BUNDLE_PAIRING_CROSS


def _unit_qualifies_for_bundle_promo(
    promo: PromotionDTO,
    product: ProductDTO,
    selected_options: dict[str, Any] | None,
) -> bool:
    selected = set(_selected_option_item_ids(selected_options))
    if not selected:
        return True
    allowed = set(promo.option_item_ids)
    return selected.issubset(allowed)


def _excluded_option_item_ids(
    promo: PromotionDTO,
    product: ProductDTO,
    selected_options: dict[str, Any] | None,
) -> list[uuid.UUID]:
    allowed = set(promo.option_item_ids)
    selected = set(_selected_option_item_ids(selected_options))
    return sorted(selected - allowed)


def _unit_base_and_options(
    product: ProductDTO,
    selected_options: dict[str, Any] | None,
) -> tuple[int, int]:
    """Base price for bundle pairing; options always billed separately in bundle promos."""
    base = product.price_cents
    options = _options_total_cents(product, selected_options, set())
    return base, options


def _unit_effective_cents(
    product: ProductDTO,
    selected_options: dict[str, Any] | None,
    waived_option_ids: set[uuid.UUID],
) -> int:
    return product.price_cents + _options_total_cents(product, selected_options, waived_option_ids)


def _promotion_applies_to_product(promo: PromotionDTO, product: ProductDTO) -> bool:
    if promo.scope == "product":
        return product.id in promo.product_ids
    if promo.scope == "category":
        if not set(product.category_ids) & set(promo.category_ids):
            return False
        if promo.product_ids:
            return product.id in promo.product_ids
        return True
    return False


def _bundle_badge(promo: PromotionDTO) -> str:
    get_q = promo.bundle_get_quantity or 2
    pay_q = promo.bundle_pay_quantity or 1
    return f"{get_q}×{pay_q}"


def _percent_badge(promo: PromotionDTO) -> str:
    if promo.percent is not None:
        return f"-{promo.percent}%"
    return ""


def _is_cross_bundle_promo(promo: PromotionDTO) -> bool:
    return promo.type == "two_for_one" and promo.scope in ("category", "product")


def _allocate_cross_bundle_free_bases(
    units: list[_CartUnit],
    get_q: int,
    pay_q: int,
) -> list[bool]:
    """Mark units whose base price is waived. Pairing uses base price only."""
    n = len(units)
    if n == 0 or get_q < 2 or pay_q < 1 or pay_q >= get_q:
        return [False] * n

    free_flags = [False] * n
    sorted_indices = sorted(range(n), key=lambda i: units[i].base_cents)
    free_per_group = get_q - pay_q

    if get_q == 2 and pay_q == 1:
        left, right = 0, n - 1
        while left < right:
            free_flags[sorted_indices[left]] = True
            left += 1
            right -= 1
        return free_flags

    remaining = list(sorted_indices)
    while len(remaining) >= get_q:
        group = remaining[:get_q]
        remaining = remaining[get_q:]
        group_sorted = sorted(group, key=lambda i: units[i].base_cents)
        for idx in group_sorted[:free_per_group]:
            free_flags[idx] = True
    return free_flags


def _allocate_bundle_free_flags(
    units: list[_CartUnit],
    get_q: int,
    pay_q: int,
    pairing_mode: str,
) -> list[bool]:
    if not units:
        return []
    if pairing_mode == BUNDLE_PAIRING_SAME:
        free_flags = [False] * len(units)
        groups: dict[uuid.UUID, list[int]] = {}
        for index, unit in enumerate(units):
            groups.setdefault(unit.product_id, []).append(index)
        for indices in groups.values():
            group_units = [units[i] for i in indices]
            group_free = _allocate_cross_bundle_free_bases(group_units, get_q, pay_q)
            for index, is_free in zip(indices, group_free, strict=True):
                free_flags[index] = is_free
        return free_flags
    return _allocate_cross_bundle_free_bases(units, get_q, pay_q)


def _cross_bundle_line_totals(
    lines: list[CartLineInput],
    products_by_id: dict[uuid.UUID, ProductDTO],
    promo: PromotionDTO,
    promotions: list[PromotionDTO],
    now_utc: datetime,
    tz: ZoneInfo,
) -> dict[int, tuple[int, int, str | None, uuid.UUID, list[str]]]:
    """line_index -> (line_total, discount, badge, promo_id, warnings)."""
    get_q = promo.bundle_get_quantity or 2
    pay_q = promo.bundle_pay_quantity or 1
    if get_q < 2 or pay_q < 1 or pay_q >= get_q:
        return {}

    pairing_mode = _bundle_pairing_mode(promo)
    qualifying_units: list[_CartUnit] = []
    line_full_subtotals: dict[int, int] = {}
    non_qualifying_totals: dict[int, int] = {}
    line_warnings: dict[int, list[str]] = {}

    for line_index, line in enumerate(lines):
        product = products_by_id.get(line.product_id)
        if product is None or not _promotion_applies_to_product(promo, product):
            continue

        discounted_base = _discounted_base_cents(product, promotions, now_utc, tz)
        _, options = _unit_base_and_options(product, line.selected_options)
        unit_full = (discounted_base + options)
        line_full_subtotals[line_index] = line_full_subtotals.get(line_index, 0) + unit_full * line.quantity

        qualifies = _unit_qualifies_for_bundle_promo(promo, product, line.selected_options)
        if not qualifies:
            non_qualifying_totals[line_index] = (
                non_qualifying_totals.get(line_index, 0) + unit_full * line.quantity
            )
            if _excluded_option_item_ids(promo, product, line.selected_options):
                line_warnings.setdefault(line_index, []).append(PROMO_WARNING_COMPLEMENT_EXCLUDED)
            continue

        for _ in range(line.quantity):
            qualifying_units.append(
                _CartUnit(
                    line_index=line_index,
                    product_id=product.id,
                    base_cents=discounted_base,
                    options_cents=options,
                )
            )

    if not qualifying_units:
        return {}

    free_flags = _allocate_bundle_free_flags(qualifying_units, get_q, pay_q, pairing_mode)
    badge = _bundle_badge(promo)
    bundle_line_totals: dict[int, int] = {idx: 0 for idx in line_full_subtotals}

    for unit, free_base in zip(qualifying_units, free_flags, strict=True):
        if free_base:
            bundle_line_totals[unit.line_index] += unit.options_cents
        else:
            bundle_line_totals[unit.line_index] += unit.base_cents + unit.options_cents

    result: dict[int, tuple[int, int, str | None, uuid.UUID, list[str]]] = {}
    for idx, full_subtotal in line_full_subtotals.items():
        bundle_part = bundle_line_totals.get(idx, 0)
        non_qual = non_qualifying_totals.get(idx, 0)
        line_total = bundle_part + non_qual
        discount = full_subtotal - line_total
        applied_badge = badge if bundle_part > 0 and discount > 0 else None
        applied_promo = promo.id if discount > 0 else None
        warnings = line_warnings.get(idx, [])
        result[idx] = (line_total, discount, applied_badge, applied_promo, warnings)

    return result


def _bundle_warnings_for_line(
    line_index: int,
    line: CartLineInput,
    products_by_id: dict[uuid.UUID, ProductDTO],
    bundle_promos: list[PromotionDTO],
) -> list[str]:
    product = products_by_id.get(line.product_id)
    if product is None:
        return []
    warnings: list[str] = []
    for promo in bundle_promos:
        if not _promotion_applies_to_product(promo, product):
            continue
        if _excluded_option_item_ids(promo, product, line.selected_options):
            warnings.append(PROMO_WARNING_COMPLEMENT_EXCLUDED)
    return warnings


def _line_discount_for_promo(
    promo: PromotionDTO,
    product: ProductDTO,
    quantity: int,
    selected_options: dict[str, Any] | None,
) -> tuple[int, int, str | None]:
    """Returns (line_total_cents, discount_cents, badge). Per-line only (percent/amount)."""
    waived = set(promo.option_item_ids)
    unit = _unit_effective_cents(product, selected_options, waived)
    line_subtotal = unit * quantity

    if promo.type == "percent" and promo.percent is not None:
        discount = round(line_subtotal * promo.percent / 100)
        return line_subtotal - discount, discount, _percent_badge(promo)

    if promo.type == "amount" and promo.amount_cents is not None:
        discount = min(promo.amount_cents * quantity, line_subtotal)
        return line_subtotal - discount, discount, None

    return line_subtotal, 0, None


def price_cart(
    *,
    lines: list[CartLineInput],
    products_by_id: dict[uuid.UUID, ProductDTO],
    promotions: list[PromotionDTO],
    now_utc: datetime,
    tz: ZoneInfo,
) -> CartQuoteResult:
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=UTC)

    effective = [p for p in promotions if is_promotion_effective(p, now_utc, tz)]
    cross_bundle_promos = [p for p in effective if _is_cross_bundle_promo(p)]
    line_promos = [
        p
        for p in effective
        if p.scope in ("product", "category") and p.type not in ("combo", "two_for_one")
    ]
    order_promos = [p for p in effective if p.scope == "order" and p.type in ("percent", "amount")]

    best_cross: dict[int, tuple[int, int, str | None, uuid.UUID, list[str]]] = {}
    best_cross_cart_total: int | None = None

    for promo in cross_bundle_promos:
        cross_totals = _cross_bundle_line_totals(
            lines, products_by_id, promo, promotions, now_utc, tz
        )
        if not cross_totals:
            continue
        cart_total = sum(total for total, _, _, _, _ in cross_totals.values())
        if best_cross_cart_total is None or cart_total < best_cross_cart_total:
            best_cross_cart_total = cart_total
            best_cross = cross_totals

    priced_lines: list[PricedCartLine] = []
    subtotal_before = 0

    for line_index, line in enumerate(lines):
        product = products_by_id.get(line.product_id)
        if product is None:
            continue

        waived_empty: set[uuid.UUID] = set()
        base_unit = _unit_effective_cents(product, line.selected_options, waived_empty)
        base_subtotal = base_unit * line.quantity
        subtotal_before += base_subtotal

        best_total: int | None = None
        best_discount = 0
        best_badge: str | None = None
        best_promo_id: uuid.UUID | None = None

        best_warnings: list[str] = []

        if line_index in best_cross:
            total, discount, badge, promo_id, warnings = best_cross[line_index]
            best_total = total
            best_discount = discount
            best_badge = badge
            best_promo_id = promo_id
            best_warnings = warnings

        for promo in line_promos:
            if not _promotion_applies_to_product(promo, product):
                continue
            total, discount, badge = _line_discount_for_promo(
                promo, product, line.quantity, line.selected_options
            )
            if best_total is None or total < best_total:
                best_total = total
                best_discount = discount
                best_badge = badge
                best_promo_id = promo.id

        if best_total is None:
            best_total = base_subtotal
            best_discount = 0

        if not best_warnings:
            best_warnings = _bundle_warnings_for_line(
                line_index, line, products_by_id, cross_bundle_promos
            )

        priced_lines.append(
            PricedCartLine(
                product_id=line.product_id,
                quantity=line.quantity,
                unit_base_cents=product.price_cents,
                options_cents=_options_total_cents(product, line.selected_options, set()),
                discount_cents=best_discount,
                line_total_cents=best_total,
                badge=best_badge,
                applied_promotion_id=best_promo_id,
                promo_warnings=best_warnings or None,
            )
        )

    lines_subtotal = sum(pl.line_total_cents for pl in priced_lines)
    best_order_discount = 0
    best_order_promo_id: uuid.UUID | None = None

    for promo in order_promos:
        if promo.min_order_cents is not None and lines_subtotal < promo.min_order_cents:
            continue
        if promo.type == "percent" and promo.percent is not None:
            discount = round(lines_subtotal * promo.percent / 100)
        elif promo.type == "amount" and promo.amount_cents is not None:
            discount = min(promo.amount_cents, lines_subtotal)
        else:
            continue
        if discount > best_order_discount:
            best_order_discount = discount
            best_order_promo_id = promo.id

    total = lines_subtotal - best_order_discount

    return CartQuoteResult(
        lines=priced_lines,
        subtotal_before_discount_cents=subtotal_before,
        order_discount_cents=best_order_discount,
        total_cents=total,
        applied_order_promotion_id=best_order_promo_id,
    )
