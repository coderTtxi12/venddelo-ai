from __future__ import annotations

import uuid

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.orders import Order, OrderItem
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import OrderCreate, OrderDTO


class SqlAlchemyOrderRepository(OrderRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, data: OrderCreate) -> OrderDTO:
        payload = data.model_dump(exclude={"items"})
        order = Order(**payload)
        order.items = [OrderItem(**i.model_dump()) for i in data.items]
        self._session.add(order)
        self._session.flush()
        self._session.refresh(order)
        return OrderDTO.model_validate(order)

    def get(self, id: uuid.UUID) -> OrderDTO | None:
        obj = self._session.get(Order, id)
        return OrderDTO.model_validate(obj) if obj else None

    def list_by_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None = None,
    ) -> CursorPage[OrderDTO]:
        stmt = (
            select(Order)
            .where(Order.restaurant_id == restaurant_id)
            .order_by(Order.created_at, Order.id)
            .limit(params.limit + 1)
        )
        if status is not None:
            stmt = stmt.where(Order.status == status)
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Order.created_at, Order.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[OrderDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update_status(self, id: uuid.UUID, status: str) -> OrderDTO | None:
        obj = self._session.get(Order, id)
        if obj is None:
            return None
        obj.status = status
        self._session.flush()
        return OrderDTO.model_validate(obj)

    def get_by_idempotency_key(self, restaurant_id: uuid.UUID, key: str) -> OrderDTO | None:
        obj = self._session.scalar(
            select(Order).where(
                Order.restaurant_id == restaurant_id,
                Order.idempotency_key == key,
            )
        )
        return OrderDTO.model_validate(obj) if obj else None
