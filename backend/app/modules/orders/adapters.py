from __future__ import annotations

import uuid

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session, selectinload

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.orders import Order, OrderItem
from app.modules.orders.constants import (
    ACTIVE_ORDER_STATUSES,
    ALL_ORDER_STATUSES,
    ARCHIVE_ORDER_STATUSES,
)
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import OrderCreate, OrderDTO, OrderStatusSummaryDTO


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
        obj = self._session.scalar(
            select(Order).options(selectinload(Order.items)).where(Order.id == id)
        )
        return OrderDTO.model_validate(obj) if obj else None

    def list_by_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None = None,
        view: str | None = None,
    ) -> CursorPage[OrderDTO]:
        stmt = (
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.restaurant_id == restaurant_id)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(params.limit + 1)
        )
        if status is not None:
            stmt = stmt.where(Order.status == status)
        elif view == "active":
            stmt = stmt.where(Order.status.in_(ACTIVE_ORDER_STATUSES))
        elif view == "archive":
            stmt = stmt.where(Order.status.in_(ARCHIVE_ORDER_STATUSES))
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Order.created_at, Order.id) < (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[OrderDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def status_summary(self, restaurant_id: uuid.UUID) -> OrderStatusSummaryDTO:
        rows = self._session.execute(
            select(Order.status, func.count())
            .where(Order.restaurant_id == restaurant_id)
            .group_by(Order.status)
        ).all()
        counts = {status: count for status, count in rows}
        pending = int(counts.get("pending", 0))
        confirmed = int(counts.get("confirmed", 0))
        preparing = int(counts.get("preparing", 0))
        ready = int(counts.get("ready", 0))
        delivered = int(counts.get("delivered", 0))
        cancelled = int(counts.get("cancelled", 0))
        active = pending + confirmed + preparing + ready
        total = sum(int(counts.get(status, 0)) for status in ALL_ORDER_STATUSES)
        return OrderStatusSummaryDTO(
            pending=pending,
            confirmed=confirmed,
            preparing=preparing,
            ready=ready,
            delivered=delivered,
            cancelled=cancelled,
            active=active,
            total=total,
        )

    def update_status(
        self,
        id: uuid.UUID,
        status: str,
        *,
        cancellation_reason: str | None = None,
    ) -> OrderDTO | None:
        obj = self._session.get(Order, id)
        if obj is None:
            return None
        obj.status = status
        if cancellation_reason is not None:
            obj.cancellation_reason = cancellation_reason
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
