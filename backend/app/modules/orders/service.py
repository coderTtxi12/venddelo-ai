from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.idempotency import IdempotencyRepository
from app.core.pagination import CursorPage, PaginationParams
from app.modules.menu.repository import MenuRepository
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import (
    AppliedDiscountSnapshot,
    OrderCreate,
    OrderDTO,
    OrderItemCreate,
    PublicOrderInput,
)
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
from app.modules.delivery_providers.partnerships import DeliveryPartnershipService
from app.modules.public.checkout_payments import is_public_payment_method_enabled
from app.modules.public.delivery_quote_service import PublicDeliveryQuoteService
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import RestaurantDTO
from app.infra.realtime.order_hub import get_order_realtime_hub

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
        catalog_cents = min(catalog_per_unit * quantity, priced.discount_cents)
        bundle_cents = priced.discount_cents - catalog_cents
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
        *,
        partnership: DeliveryPartnershipService | None = None,
        delivery_quotes: PublicDeliveryQuoteService | None = None,
        idempotency_ttl_seconds: int | None = None,
    ) -> None:
        self._orders = orders
        self._restaurants = restaurants
        self._menu = menu
        self._idempotency = idempotency
        self._promotions = promotions
        self._partnership = partnership
        self._delivery_quotes = delivery_quotes
        self._idempotency_ttl = (
            idempotency_ttl_seconds or get_settings().order_idempotency_ttl_seconds
        )

    def _publish_order_event(self, restaurant_id: uuid.UUID, event_type: str, order: OrderDTO) -> None:
        get_order_realtime_hub().publish_sync(
            restaurant_id,
            {"type": event_type, "order": order.model_dump(mode="json")},
        )

    def list_for_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None = None,
    ) -> CursorPage[OrderDTO]:
        return self._orders.list_by_restaurant(restaurant_id, params, status=status)

    def get(self, restaurant_id: uuid.UUID, order_id: uuid.UUID) -> OrderDTO:
        dto = self._orders.get(order_id)
        if dto is None or dto.restaurant_id != restaurant_id:
            raise NotFoundError("Order not found")
        return dto

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
        dto = self._orders.update_status(
            order_id,
            status,
            cancellation_reason=cancellation_reason,
        )
        if dto is None:
            raise NotFoundError("Order not found")
        self._publish_order_event(restaurant_id, "order.updated", dto)
        return dto

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

        if order_type == "delivery":
            for pm in restaurant_methods:
                if (
                    pm.method == payment_method
                    and pm.service_type == "delivery"
                    and pm.enabled
                ):
                    return

        raise ValidationError("Payment method not enabled for this order type")

    def _build_priced_order(
        self, restaurant_id: uuid.UUID, timezone: str, data: PublicOrderInput
    ) -> tuple[list[OrderItemCreate], int, int, int, uuid.UUID | None, list[PromotionDTO]]:
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
            if (
                not product.is_active
                or not product.is_published
                or product.approval_status != "approved"
            ):
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
            promotions,
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
        order_items, subtotal_before, order_discount, lines_total, order_promo_id, promotions = (
            self._build_priced_order(restaurant.id, restaurant.timezone, data)
        )
        lines_subtotal = lines_total + order_discount

        delivery_fee_cents = 0
        if data.type == "delivery":
            if data.delivery_fee_cents < 0:
                raise ValidationError("delivery_fee_cents must be >= 0")
            delivery_fee_cents = data.delivery_fee_cents
        elif data.delivery_fee_cents > 0:
            raise ValidationError("delivery_fee_cents is only allowed for delivery orders")

        order_total = lines_total + delivery_fee_cents
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
                applied_order_discounts=_snapshot_order_discounts(
                    order_discount,
                    order_promo_id,
                    promotions,
                ),
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
        self._publish_order_event(restaurant.id, "order.created", order)
        return order
