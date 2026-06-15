from __future__ import annotations

import hashlib
import json
import uuid

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
from app.modules.restaurants.repository import RestaurantRepository

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
        *,
        idempotency_ttl_seconds: int | None = None,
    ) -> None:
        self._orders = orders
        self._restaurants = restaurants
        self._menu = menu
        self._idempotency = idempotency
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

    def _build_order_items(
        self, restaurant_id: uuid.UUID, data: PublicOrderInput
    ) -> tuple[list[OrderItemCreate], int]:
        if not data.items:
            raise ValidationError("Order must contain at least one item")
        items: list[OrderItemCreate] = []
        subtotal = 0
        for line in data.items:
            if line.quantity < 1:
                raise ValidationError("Quantity must be at least 1")
            product = self._menu.get_product(line.product_id)
            if product is None or product.restaurant_id != restaurant_id:
                raise NotFoundError(f"Product {line.product_id} not found")
            if not product.is_published or product.approval_status != "approved":
                raise ValidationError(f"Product {line.product_id} is not available")
            line_total = product.price_cents * line.quantity
            subtotal += line_total
            items.append(
                OrderItemCreate(
                    product_id=product.id,
                    product_name=product.name,
                    quantity=line.quantity,
                    unit_price_cents=product.price_cents,
                    selected_options=line.selected_options,
                    line_total_cents=line_total,
                )
            )
        return items, subtotal

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
        if restaurant.status != "published":
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
        order_items, subtotal = self._build_order_items(restaurant.id, data)

        order = self._orders.add(
            OrderCreate(
                restaurant_id=restaurant.id,
                type=data.type,
                customer_name=data.customer_name,
                customer_phone=data.customer_phone,
                payment_method=data.payment_method,
                subtotal_cents=subtotal,
                total_cents=subtotal,
                delivery_address=data.delivery_address,
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
