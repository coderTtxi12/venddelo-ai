from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import String, cast, func, or_, select, tuple_, update
from sqlalchemy.orm import Session, selectinload

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    decode_sort_keyset_cursor,
    encode_keyset_cursor,
    encode_sort_keyset_cursor,
)
from app.db.models.delivery import DeliveryDispatchRequest
from app.db.models.orders import Order, OrderItem
from app.modules.orders.constants import (
    ACTIVE_ORDER_STATUSES,
    ALL_ORDER_STATUSES,
    ARCHIVE_ORDER_STATUSES,
)
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import (
    OrderCreate,
    OrderDispatchDTO,
    OrderDTO,
    OrderStatusSummaryDTO,
)


def _phone_digits(value: str) -> str:
    return re.sub(r"\D+", "", value)


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
        return self._to_dto(order)

    def get(self, id: uuid.UUID) -> OrderDTO | None:
        obj = self._session.scalar(
            select(Order).options(selectinload(Order.items)).where(Order.id == id)
        )
        return self._to_dto(obj) if obj is not None else None

    def list_by_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None = None,
        view: str | None = None,
        board: str = "kitchen",
        q: str | None = None,
        order_type: str | None = None,
        payment_method: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> CursorPage[OrderDTO]:
        if board == "history":
            return self._list_history(
                restaurant_id,
                params,
                status=status,
                q=q,
                order_type=order_type,
                payment_method=payment_method,
                from_date=from_date,
                to_date=to_date,
                sort=sort,
                order=order,
            )

        stmt = (
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.restaurant_id == restaurant_id)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(params.limit + 1)
        )
        stmt = stmt.where(Order.kds_cleared_at.is_(None))
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
            items=self._attach_dispatch([OrderDTO.model_validate(r) for r in rows]),
            next_cursor=next_cursor,
            has_more=has_more,
            total=None,
        )

    def _history_filters(
        self,
        restaurant_id: uuid.UUID,
        *,
        status: str | None,
        q: str | None,
        order_type: str | None,
        payment_method: str | None,
        from_date: date | None,
        to_date: date | None,
    ):
        filters = [
            Order.restaurant_id == restaurant_id,
            Order.status.in_(ARCHIVE_ORDER_STATUSES),
        ]
        if status is not None:
            filters.append(Order.status == status)
        if order_type is not None:
            filters.append(Order.type == order_type)
        if payment_method is not None:
            filters.append(Order.payment_method == payment_method)
        if from_date is not None:
            start = datetime(from_date.year, from_date.month, from_date.day, tzinfo=UTC)
            filters.append(Order.created_at >= start)
        if to_date is not None:
            end = datetime(to_date.year, to_date.month, to_date.day, tzinfo=UTC) + timedelta(days=1)
            filters.append(Order.created_at < end)
        if q:
            term = q.strip()
            if term:
                clauses = [
                    Order.customer_name.ilike(f"%{term}%"),
                    Order.note.ilike(f"%{term}%"),
                    cast(Order.id, String).ilike(f"%{term}%"),
                ]
                digits = _phone_digits(term)
                if digits:
                    clauses.append(Order.customer_phone.ilike(f"%{digits}%"))
                filters.append(or_(*clauses))
        return filters

    def _list_history(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None,
        q: str | None,
        order_type: str | None,
        payment_method: str | None,
        from_date: date | None,
        to_date: date | None,
        sort: str,
        order: str,
    ) -> CursorPage[OrderDTO]:
        filters = self._history_filters(
            restaurant_id,
            status=status,
            q=q,
            order_type=order_type,
            payment_method=payment_method,
            from_date=from_date,
            to_date=to_date,
        )
        total = int(
            self._session.scalar(select(func.count()).select_from(Order).where(*filters)) or 0
        )

        sort_col = Order.created_at if sort == "created_at" else Order.total_cents
        ascending = order == "asc"
        order_by = (
            (sort_col.asc(), Order.id.asc()) if ascending else (sort_col.desc(), Order.id.desc())
        )

        stmt = (
            select(Order)
            .options(selectinload(Order.items))
            .where(*filters)
            .order_by(*order_by)
            .limit(params.limit + 1)
        )
        if params.cursor:
            sort_key, value, last_id = decode_sort_keyset_cursor(params.cursor)
            if sort_key == "total_cents":
                pivot: datetime | int = int(value)
                col = Order.total_cents
            else:
                pivot = datetime.fromisoformat(value)
                col = Order.created_at
            if ascending:
                stmt = stmt.where(tuple_(col, Order.id) > (pivot, last_id))
            else:
                stmt = stmt.where(tuple_(col, Order.id) < (pivot, last_id))

        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            cursor_value = (
                last.created_at.isoformat() if sort == "created_at" else str(last.total_cents)
            )
            next_cursor = encode_sort_keyset_cursor(sort, cursor_value, last.id)
        return CursorPage(
            items=self._attach_dispatch([OrderDTO.model_validate(r) for r in rows]),
            next_cursor=next_cursor,
            has_more=has_more,
            total=total,
        )

    def status_summary(
        self,
        restaurant_id: uuid.UUID,
        *,
        board: str = "kitchen",
    ) -> OrderStatusSummaryDTO:
        stmt = select(Order.status, func.count()).where(Order.restaurant_id == restaurant_id)
        if board == "history":
            stmt = stmt.where(Order.status.in_(ARCHIVE_ORDER_STATUSES))
        else:
            stmt = stmt.where(Order.kds_cleared_at.is_(None))
        rows = self._session.execute(stmt.group_by(Order.status)).all()
        counts = {status: count for status, count in rows}
        pending = int(counts.get("pending", 0))
        confirmed = int(counts.get("confirmed", 0))
        preparing = int(counts.get("preparing", 0))
        ready = int(counts.get("ready", 0))
        delivered = int(counts.get("delivered", 0))
        cancelled = int(counts.get("cancelled", 0))
        active = pending + confirmed + preparing + ready
        total = sum(int(counts.get(status, 0)) for status in ALL_ORDER_STATUSES)
        delivery = 0
        if board == "history":
            delivery = int(
                self._session.scalar(
                    select(func.count()).where(
                        Order.restaurant_id == restaurant_id,
                        Order.status.in_(ARCHIVE_ORDER_STATUSES),
                        Order.type == "delivery",
                    )
                )
                or 0
            )
        return OrderStatusSummaryDTO(
            pending=pending,
            confirmed=confirmed,
            preparing=preparing,
            ready=ready,
            delivered=delivered,
            cancelled=cancelled,
            active=active,
            total=total,
            delivery=delivery,
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
        return self._to_dto(obj)

    def clear_closed_from_kds(
        self,
        restaurant_id: uuid.UUID,
        *,
        cleared_at: datetime | None = None,
    ) -> int:
        stamped = cleared_at or datetime.now(UTC)
        result = self._session.execute(
            update(Order)
            .where(
                Order.restaurant_id == restaurant_id,
                Order.status.in_(ARCHIVE_ORDER_STATUSES),
                Order.kds_cleared_at.is_(None),
            )
            .values(kds_cleared_at=stamped)
        )
        return int(result.rowcount or 0)

    def get_by_idempotency_key(self, restaurant_id: uuid.UUID, key: str) -> OrderDTO | None:
        obj = self._session.scalar(
            select(Order).where(
                Order.restaurant_id == restaurant_id,
                Order.idempotency_key == key,
            )
        )
        return self._to_dto(obj) if obj is not None else None

    def _to_dto(self, order: Order) -> OrderDTO:
        return self._attach_dispatch([OrderDTO.model_validate(order)])[0]

    def _attach_dispatch(self, dtos: list[OrderDTO]) -> list[OrderDTO]:
        if not dtos:
            return dtos
        rows = self._session.scalars(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.order_id.in_([dto.id for dto in dtos]))
            .order_by(DeliveryDispatchRequest.created_at.desc())
        ).all()
        by_order: dict[uuid.UUID, DeliveryDispatchRequest] = {}
        for row in rows:
            if row.order_id is None or row.order_id in by_order:
                continue
            by_order[row.order_id] = row
        return [
            dto.model_copy(
                update={
                    "dispatch": OrderDispatchDTO(
                        tracking_token=row.tracking_token,
                        short_id=row.short_id,
                        status=row.status,
                    )
                    if (row := by_order.get(dto.id)) is not None
                    else None
                }
            )
            for dto in dtos
        ]
