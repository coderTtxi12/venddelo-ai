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
    OrderCreate,
    OrderDTO,
    OrderItemCreate,
    PublicOrderInput,
)
from app.modules.promotions.effective import resolve_timezone
from app.modules.promotions.pricing import CartLineInput, price_cart
from app.modules.promotions.repository import PromotionRepository
from app.modules.restaurants.repository import RestaurantRepository

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


class OrderService:
    def __init__(
        self,
        orders: OrderRepository,
        restaurants: RestaurantRepository,
        menu: MenuRepository,
        idempotency: IdempotencyRepository,
        promotions: PromotionRepository,
        *,
        idempotency_ttl_seconds: int | None = None,
    ) -> None:
        self._orders = orders
        self._restaurants = restaurants
        self._menu = menu
        self._idempotency = idempotency
        self._promotions = promotions
        self._idempotency_ttl = (
            idempotency_ttl_seconds or get_settings().order_idempotency_ttl_seconds
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

    def update_status(self, restaurant_id: uuid.UUID, order_id: uuid.UUID, status: str) -> OrderDTO:
        order = self.get(restaurant_id, order_id)
        allowed = _STATUS_TRANSITIONS.get(order.status, set())
        if status not in allowed:
            raise ValidationError(f"Cannot transition from {order.status} to {status}")
        dto = self._orders.update_status(order_id, status)
        if dto is None:
            raise NotFoundError("Order not found")
        return dto

    def _validate_payment_method(
        self, restaurant_id: uuid.UUID, order_type: str, payment_method: str
    ) -> None:
        methods = self._restaurants.list_payment_methods(restaurant_id)
        for pm in methods:
            if pm.method == payment_method and pm.service_type == order_type and pm.enabled:
                return
        raise ValidationError("Payment method not enabled for this order type")

    def _build_priced_order(
        self, restaurant_id: uuid.UUID, timezone: str, data: PublicOrderInput
    ) -> tuple[list[OrderItemCreate], int, int, int, uuid.UUID | None]:
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
                    quantity=line_input.quantity,
                    unit_price_cents=unit_with_options,
                    selected_options=line_input.selected_options,
                    line_subtotal_cents=priced.line_total_cents + priced.discount_cents,
                    discount_cents=priced.discount_cents,
                    line_total_cents=priced.line_total_cents,
                    applied_promotion_id=priced.applied_promotion_id,
                )
            )

        subtotal_before = quote.subtotal_before_discount_cents
        total = quote.total_cents
        return items, subtotal_before, quote.order_discount_cents, total, quote.applied_order_promotion_id

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

        self._validate_payment_method(restaurant.id, data.type, data.payment_method)
        order_items, subtotal_before, order_discount, lines_total, order_promo_id = (
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
                delivery_address=data.delivery_address,
                delivery_fee_cents=delivery_fee_cents,
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
        return order
