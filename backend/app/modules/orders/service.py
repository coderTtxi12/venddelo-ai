from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.exceptions import ConflictError, CouponValidationError, NotFoundError, ValidationError
from app.core.idempotency import IdempotencyRepository
from app.core.pagination import CursorPage, PaginationParams
from app.infra.realtime.order_hub import get_order_realtime_hub
from app.modules.delivery_providers.partnerships import DeliveryPartnershipService
from app.modules.menu.repository import MenuRepository
from app.modules.orders.coupons import should_redeem_coupon_on_transition
from app.modules.orders.delivery_fee import (
    customer_payable_delivery_cents,
    resolve_delivery_waiver_cents,
)
from app.modules.orders.constants import (
    ARCHIVE_ORDER_STATUSES,
    KITCHEN_BULK_STATUS_LIMIT,
    KITCHEN_ORDER_BOARDS,
    KITCHEN_ORDER_VIEWS,
)
from app.modules.orders.inventory import (
    quantities_to_consume,
    should_consume_inventory_on_transition,
)
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import (
    AppliedDiscountSnapshot,
    OrderBulkStatusResult,
    OrderCreate,
    OrderDTO,
    OrderItemCreate,
    OrderStatusSummaryDTO,
    PublicOrderInput,
)
from app.modules.coupons.pricing import CouponApplyResult, apply_coupon, normalize_coupon_code
from app.modules.coupons.service import CouponService
from app.modules.promotions.effective import is_promotion_effective, resolve_timezone
from app.modules.promotions.pricing import (
    CATALOG_DISCOUNT_PREFIX,
    CartLineInput,
    PricedCartLine,
    _discounted_base_cents,
    _is_catalog_discount_promo,
    _is_cross_bundle_promo,
    price_cart,
)
from app.modules.promotions.repository import PromotionRepository
from app.modules.promotions.schemas import PromotionDTO
from app.modules.public.checkout_payments import is_public_payment_method_enabled
from app.modules.public.delivery_quote_service import PublicDeliveryQuoteService
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import RestaurantDTO

_BLOCKED_PUBLIC_ORDER_STATUSES = frozenset({"suspended"})
_ALLOWED_ORDER_TYPES = {"takeout", "delivery"}
_ALLOWED_PAYMENT_METHODS = {"cash", "transfer", "card_terminal"}
_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}


def _hash_public_order(data: PublicOrderInput) -> str:
    payload = json.dumps(data.model_dump(mode="json"), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def _resolve_cash_denomination_cents(
    data: PublicOrderInput,
    *,
    order_total_cents: int,
) -> int | None:
    requires_denomination = data.type == "delivery" and data.payment_method == "cash"
    if requires_denomination:
        if data.cash_denomination_cents is None:
            raise ValidationError("cash_denomination_cents is required for delivery cash orders")
        if data.cash_denomination_cents <= 0:
            raise ValidationError("cash_denomination_cents must be positive")
        if data.cash_denomination_cents < order_total_cents:
            raise ValidationError("cash_denomination_cents must be at least the order total")
        return data.cash_denomination_cents

    if data.cash_denomination_cents is not None:
        raise ValidationError("cash_denomination_cents is only allowed for delivery cash orders")
    return None


def _promo_display_name(promo: PromotionDTO) -> str:
    if promo.name.startswith(CATALOG_DISCOUNT_PREFIX):
        return "Descuento de producto"
    return promo.name


def _percent_badge(promo: PromotionDTO) -> str | None:
    if promo.percent is not None:
        return f"-{promo.percent}%"
    return None


def _catalog_discount_per_unit_cents(
    product,
    promotions: list[PromotionDTO],
    now_utc: datetime,
    tz,
) -> int:
    base = product.price_cents
    discounted = _discounted_base_cents(product, promotions, now_utc, tz)
    return max(0, base - discounted)


def _snapshot_line_discounts(
    priced: PricedCartLine,
    product,
    quantity: int,
    promotions: list[PromotionDTO],
    now_utc: datetime,
    tz,
) -> list[AppliedDiscountSnapshot]:
    if priced.discount_cents <= 0:
        return []

    applied_promo = next(
        (promo for promo in promotions if promo.id == priced.applied_promotion_id),
        None,
    )
    catalog_per_unit = _catalog_discount_per_unit_cents(product, promotions, now_utc, tz)
    catalog_promo = next(
        (
            promo
            for promo in promotions
            if _is_catalog_discount_promo(promo, product.id)
            and is_promotion_effective(promo, now_utc, tz)
        ),
        None,
    )

    if (
        applied_promo is not None
        and _is_cross_bundle_promo(applied_promo)
        and catalog_promo is not None
        and catalog_per_unit > 0
    ):
        catalog_cents = catalog_per_unit * quantity
        bundle_cents = priced.discount_cents
        snapshots: list[AppliedDiscountSnapshot] = []

        if catalog_cents > 0:
            snapshots.append(
                AppliedDiscountSnapshot(
                    label=_promo_display_name(catalog_promo),
                    badge=_percent_badge(catalog_promo),
                    discount_cents=catalog_cents,
                    applied=True,
                )
            )
        if bundle_cents > 0:
            snapshots.append(
                AppliedDiscountSnapshot(
                    label=_promo_display_name(applied_promo),
                    badge=priced.badge,
                    discount_cents=bundle_cents,
                    applied=True,
                )
            )
        return snapshots

    label = _promo_display_name(applied_promo) if applied_promo else "Descuento"
    return [
        AppliedDiscountSnapshot(
            label=label,
            badge=priced.badge,
            discount_cents=priced.discount_cents,
            applied=True,
        )
    ]


def _snapshot_coupon_discount(applied: CouponApplyResult) -> AppliedDiscountSnapshot:
    discount_cents = applied.discount_cents or applied.waived_delivery_cents
    return AppliedDiscountSnapshot(
        label=f"Cupón {applied.code}",
        badge=applied.code,
        discount_cents=discount_cents,
        applied=True,
    )


def _snapshot_order_discounts(
    order_discount_cents: int,
    order_promo_id: uuid.UUID | None,
    promotions: list[PromotionDTO],
) -> list[AppliedDiscountSnapshot]:
    if order_discount_cents <= 0:
        return []
    promo = next((p for p in promotions if p.id == order_promo_id), None)
    label = _promo_display_name(promo) if promo else "Descuento en pedido"
    return [
        AppliedDiscountSnapshot(
            label=label,
            discount_cents=order_discount_cents,
            applied=True,
        )
    ]


class OrderService:
    def __init__(
        self,
        orders: OrderRepository,
        restaurants: RestaurantRepository,
        menu: MenuRepository,
        idempotency: IdempotencyRepository,
        promotions: PromotionRepository,
        coupons: CouponService,
        *,
        partnership: DeliveryPartnershipService | None = None,
        delivery_quotes: PublicDeliveryQuoteService | None = None,
        inventory_changed: Callable[[uuid.UUID], None] | None = None,
        idempotency_ttl_seconds: int | None = None,
    ) -> None:
        self._orders = orders
        self._restaurants = restaurants
        self._menu = menu
        self._idempotency = idempotency
        self._promotions = promotions
        self._coupons = coupons
        self._partnership = partnership
        self._delivery_quotes = delivery_quotes
        self._inventory_changed = inventory_changed
        self._idempotency_ttl = (
            idempotency_ttl_seconds or get_settings().order_idempotency_ttl_seconds
        )

    def _publish_order_event(self, restaurant_id: uuid.UUID, event_type: str, order: OrderDTO) -> None:
        get_order_realtime_hub().publish_sync(
            restaurant_id,
            {"type": event_type, "order": order.model_dump(mode="json")},
        )

    def _enrich_coupon_stock(self, order: OrderDTO) -> OrderDTO:
        if order.applied_coupon_id is None:
            return order
        try:
            coupon = self._coupons.get(order.restaurant_id, order.applied_coupon_id)
        except Exception:
            return order
        return order.model_copy(
            update={
                "coupon_stock_qty": coupon.stock_qty,
                "coupon_redeemed_count": coupon.redeemed_count,
            }
        )

    def _enrich_coupon_stock_batch(self, orders: list[OrderDTO]) -> list[OrderDTO]:
        return [self._enrich_coupon_stock(order) for order in orders]

    def list_for_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None = None,
        view: str | None = None,
        board: str = "kitchen",
    ) -> CursorPage[OrderDTO]:
        if board not in KITCHEN_ORDER_BOARDS:
            raise ValidationError(f"Unsupported board: {board}")
        if status is not None and view is not None:
            raise ValidationError("Use either status or view, not both")
        if view is not None and view not in KITCHEN_ORDER_VIEWS:
            raise ValidationError(f"Unsupported view: {view}")
        if board == "history":
            if view == "active":
                raise ValidationError("History only includes closed orders")
            if status is not None and status not in ARCHIVE_ORDER_STATUSES:
                raise ValidationError("History only includes delivered or cancelled orders")
        page = self._orders.list_by_restaurant(
            restaurant_id,
            params,
            status=status,
            view=view,
            board=board,
        )
        page.items = self._enrich_coupon_stock_batch(page.items)
        return page

    def get_status_summary(
        self,
        restaurant_id: uuid.UUID,
        *,
        board: str = "kitchen",
    ) -> OrderStatusSummaryDTO:
        if board not in KITCHEN_ORDER_BOARDS:
            raise ValidationError(f"Unsupported board: {board}")
        return self._orders.status_summary(restaurant_id, board=board)

    def get(self, restaurant_id: uuid.UUID, order_id: uuid.UUID) -> OrderDTO:
        dto = self._orders.get(order_id)
        if dto is None or dto.restaurant_id != restaurant_id:
            raise NotFoundError("Order not found")
        return self._enrich_coupon_stock(dto)

    def update_status(
        self,
        restaurant_id: uuid.UUID,
        order_id: uuid.UUID,
        status: str,
        cancellation_reason: str | None = None,
    ) -> OrderDTO:
        order = self.get(restaurant_id, order_id)
        allowed = _STATUS_TRANSITIONS.get(order.status, set())
        if status not in allowed:
            raise ValidationError(f"Cannot transition from {order.status} to {status}")
        if status == "cancelled":
            reason = (cancellation_reason or "").strip()
            if not reason:
                raise ValidationError("cancellation_reason is required when cancelling an order")
            cancellation_reason = reason
        if should_consume_inventory_on_transition(order.status, status):
            self._consume_inventory_for_order(order)
        if should_redeem_coupon_on_transition(order.status, status) and order.applied_coupon_id:
            self._coupons.redeem(order.applied_coupon_id, order.id)
        dto = self._orders.update_status(
            order_id,
            status,
            cancellation_reason=cancellation_reason,
        )
        if dto is None:
            raise NotFoundError("Order not found")
        dto = self._enrich_coupon_stock(dto)
        self._publish_order_event(restaurant_id, "order.updated", dto)
        return dto

    def update_status_bulk(
        self,
        restaurant_id: uuid.UUID,
        order_ids: list[uuid.UUID],
        status: str,
        cancellation_reason: str | None = None,
    ) -> OrderBulkStatusResult:
        unique_ids = list(dict.fromkeys(order_ids))
        if not unique_ids:
            raise ValidationError("order_ids is required")
        if len(unique_ids) > KITCHEN_BULK_STATUS_LIMIT:
            raise ValidationError(f"Cannot update more than {KITCHEN_BULK_STATUS_LIMIT} orders")
        orders = [self.get(restaurant_id, order_id) for order_id in unique_ids]
        for order in orders:
            allowed = _STATUS_TRANSITIONS.get(order.status, set())
            if status not in allowed:
                raise ValidationError(f"Cannot transition from {order.status} to {status}")
        if status == "cancelled":
            reason = (cancellation_reason or "").strip()
            if not reason:
                raise ValidationError("cancellation_reason is required when cancelling an order")
            cancellation_reason = reason
        updated = [
            self.update_status(restaurant_id, order.id, status, cancellation_reason)
            for order in orders
        ]
        return OrderBulkStatusResult(items=updated, updated_count=len(updated))

    def clear_closed_from_kds(self, restaurant_id: uuid.UUID) -> int:
        cleared_count = self._orders.clear_closed_from_kds(restaurant_id)
        if cleared_count:
            get_order_realtime_hub().publish_sync(
                restaurant_id,
                {"type": "kitchen.board_cleared", "cleared_count": cleared_count},
            )
        return cleared_count

    def _consume_inventory_for_order(self, order: OrderDTO) -> None:
        restaurant = self._restaurants.get(order.restaurant_id)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")
        if not restaurant.live_menu_inventory_enabled:
            return
        consumed = False
        for product_id, quantity in quantities_to_consume(order.items):
            consumed |= self._menu.consume_inventory(
                product_id,
                quantity,
                live_menu_inventory_enabled=restaurant.live_menu_inventory_enabled,
            )
        if consumed and self._inventory_changed is not None:
            self._inventory_changed(order.restaurant_id)

    def _validate_payment_method(
        self,
        restaurant: RestaurantDTO,
        order_type: str,
        payment_method: str,
    ) -> None:
        restaurant_methods = list(self._restaurants.list_payment_methods(restaurant.id))
        delivery_resolved_available = False
        provider_methods = []

        if order_type == "delivery":
            if self._delivery_quotes is not None:
                delivery_resolved_available = self._delivery_quotes.resolve_delivery_service(
                    restaurant
                ).available
            else:
                delivery_resolved_available = restaurant.delivery_enabled

            if delivery_resolved_available and self._partnership is not None:
                self._partnership.ensure_restaurant_delivery_payment_methods(restaurant.id)
                restaurant_methods = list(self._restaurants.list_payment_methods(restaurant.id))
                provider_methods = self._partnership.get_active_provider_payment_methods(
                    restaurant.id
                )

        if is_public_payment_method_enabled(
            restaurant,
            restaurant_methods,
            order_type=order_type,
            payment_method=payment_method,
            delivery_resolved_available=delivery_resolved_available,
            provider_methods=provider_methods,
        ):
            return

        raise ValidationError("Payment method not enabled for this order type")

    def _build_priced_order(
        self, restaurant_id: uuid.UUID, timezone: str, data: PublicOrderInput
    ) -> tuple[
        list[OrderItemCreate],
        int,
        int,
        int,
        uuid.UUID | None,
        uuid.UUID | None,
        list[PromotionDTO],
        list[PricedCartLine],
        dict[uuid.UUID, object],
        datetime,
        object,
    ]:
        if not data.items:
            raise ValidationError("Order must contain at least one item")

        tz = resolve_timezone(timezone)
        now = datetime.now(UTC)
        promo_page = self._promotions.list_active(restaurant_id, PaginationParams(limit=200))
        from app.modules.promotions.effective import is_promotion_effective

        promotions = [p for p in promo_page.items if is_promotion_effective(p, now, tz)]

        products_by_id = {}
        cart_lines: list[CartLineInput] = []
        for line in data.items:
            if line.quantity < 1:
                raise ValidationError("Quantity must be at least 1")
            product = self._menu.get_product(line.product_id)
            if product is None or product.restaurant_id != restaurant_id:
                raise NotFoundError(f"Product {line.product_id} not found")
            if product.status != "active":
                raise ValidationError(f"Product {line.product_id} is not available")
            products_by_id[product.id] = product
            cart_lines.append(
                CartLineInput(
                    product_id=line.product_id,
                    quantity=line.quantity,
                    selected_options=line.selected_options,
                )
            )

        quote = price_cart(
            lines=cart_lines,
            products_by_id=products_by_id,
            promotions=promotions,
            now_utc=now,
            tz=tz,
        )

        items: list[OrderItemCreate] = []
        for line_input, priced in zip(data.items, quote.lines, strict=True):
            product = products_by_id[line_input.product_id]
            unit_with_options = (
                priced.line_total_cents + priced.discount_cents
            ) // max(line_input.quantity, 1)
            items.append(
                OrderItemCreate(
                    product_id=product.id,
                    product_name=product.name,
                    product_image_path=product.image_path,
                    quantity=line_input.quantity,
                    unit_price_cents=unit_with_options,
                    selected_options=line_input.selected_options,
                    line_subtotal_cents=priced.line_total_cents + priced.discount_cents,
                    discount_cents=priced.discount_cents,
                    line_total_cents=priced.line_total_cents,
                    applied_promotion_id=priced.applied_promotion_id,
                    applied_discounts=_snapshot_line_discounts(
                        priced,
                        product,
                        line_input.quantity,
                        promotions,
                        now,
                        tz,
                    ),
                )
            )

        subtotal_before = quote.subtotal_before_discount_cents
        total = quote.total_cents
        return (
            items,
            subtotal_before,
            quote.order_discount_cents,
            total,
            quote.applied_order_promotion_id,
            quote.applied_free_shipping_promotion_id,
            promotions,
            quote.lines,
            products_by_id,
            now,
            tz,
        )

    def create_public(
        self,
        subdomain: str,
        data: PublicOrderInput,
        idempotency_key: str | None,
    ) -> OrderDTO:
        if data.type not in _ALLOWED_ORDER_TYPES:
            raise ValidationError("Invalid order type")
        if data.payment_method not in _ALLOWED_PAYMENT_METHODS:
            raise ValidationError("Invalid payment method")
        if data.type == "delivery" and not data.delivery_address:
            raise ValidationError("delivery_address is required for delivery orders")

        restaurant = self._restaurants.get_by_subdomain(subdomain)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")
        if restaurant.status in _BLOCKED_PUBLIC_ORDER_STATUSES:
            raise ValidationError("Restaurant is not accepting orders")

        request_hash = _hash_public_order(data)
        if idempotency_key:
            existing = self._idempotency.get(idempotency_key)
            if existing is not None:
                if existing.request_hash != request_hash:
                    raise ConflictError("Idempotency key reused with different payload")
                if existing.response_snapshot:
                    return OrderDTO.model_validate(existing.response_snapshot)

        self._validate_payment_method(restaurant, data.type, data.payment_method)
        (
            order_items,
            subtotal_before,
            order_discount,
            lines_total,
            order_promo_id,
            free_shipping_promo_id,
            promotions,
            priced_lines,
            products_by_id,
            priced_now,
            priced_tz,
        ) = self._build_priced_order(restaurant.id, restaurant.timezone, data)
        lines_subtotal = lines_total + order_discount

        delivery_fee_cents = 0
        if data.type == "delivery":
            if data.delivery_fee_cents < 0:
                raise ValidationError("delivery_fee_cents must be >= 0")
            delivery_fee_cents = data.delivery_fee_cents
        elif data.delivery_fee_cents > 0:
            raise ValidationError("delivery_fee_cents is only allowed for delivery orders")

        applied_coupon_id: uuid.UUID | None = None
        applied_coupon_code: str | None = None
        coupon_discount_cents = 0
        coupon_waived_from_coupon = 0
        order_discount_snapshots = _snapshot_order_discounts(
            order_discount,
            order_promo_id,
            promotions,
        )
        coupon_code = normalize_coupon_code(data.coupon_code)
        if coupon_code is not None:
            coupon_dto = self._coupons.resolve_public(
                restaurant.id,
                coupon_code,
                timezone=restaurant.timezone,
            )
            coupon_input = self._coupons.to_input(coupon_dto) if coupon_dto is not None else None
            applied = apply_coupon(
                lines=priced_lines,
                products_by_id=products_by_id,
                coupon=coupon_input,
                food_total_cents=lines_total,
                service_type=data.type,
                delivery_fee_cents=delivery_fee_cents,
                now_utc=priced_now,
                tz=priced_tz,
            )
            if not applied.ok:
                raise CouponValidationError(
                    applied.error_code or "coupon_not_found",
                    applied.error_message or "Código no válido",
                )
            lines_total = applied.food_total_cents
            delivery_fee_cents = applied.delivery_fee_cents
            applied_coupon_id = applied.coupon_id
            applied_coupon_code = applied.code
            coupon_discount_cents = applied.discount_cents
            coupon_waived_from_coupon = applied.waived_delivery_cents
            order_discount_snapshots = [
                *order_discount_snapshots,
                _snapshot_coupon_discount(applied),
            ]

        coupon_waived_delivery_cents = resolve_delivery_waiver_cents(
            delivery_fee_cents=delivery_fee_cents,
            coupon_waived_delivery_cents=coupon_waived_from_coupon,
            promo_free_shipping=(
                free_shipping_promo_id is not None and data.type == "delivery"
            ),
        )
        order_total = lines_total + customer_payable_delivery_cents(
            delivery_fee_cents,
            coupon_waived_delivery_cents,
        )
        cash_denomination_cents = _resolve_cash_denomination_cents(
            data,
            order_total_cents=order_total,
        )

        delivery_latitude = data.delivery_latitude if data.type == "delivery" else None
        delivery_longitude = data.delivery_longitude if data.type == "delivery" else None

        order = self._orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type=data.type,
                customer_name=data.customer_name,
                customer_phone=data.customer_phone,
                payment_method=data.payment_method,
                subtotal_cents=lines_subtotal,
                subtotal_before_discount_cents=subtotal_before,
                discount_cents=order_discount,
                total_cents=order_total,
                applied_order_promotion_id=order_promo_id,
                applied_order_discounts=order_discount_snapshots,
                applied_coupon_id=applied_coupon_id,
                applied_coupon_code=applied_coupon_code,
                coupon_discount_cents=coupon_discount_cents,
                coupon_waived_delivery_cents=coupon_waived_delivery_cents,
                delivery_address=data.delivery_address,
                delivery_latitude=delivery_latitude,
                delivery_longitude=delivery_longitude,
                delivery_fee_cents=delivery_fee_cents,
                cash_denomination_cents=cash_denomination_cents,
                note=data.note,
                idempotency_key=idempotency_key,
                items=order_items,
            )
        )

        if idempotency_key:
            self._idempotency.put(
                idempotency_key,
                request_hash,
                order.model_dump(mode="json"),
                self._idempotency_ttl,
            )
        self._publish_order_event(restaurant.id, "order.created", self._enrich_coupon_stock(order))
        return self._enrich_coupon_stock(order)
