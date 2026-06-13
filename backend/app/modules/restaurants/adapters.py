from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.restaurant import (
    Restaurant,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
)


class SqlAlchemyRestaurantRepository(RestaurantRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, data: RestaurantCreate) -> RestaurantDTO:
        obj = Restaurant(**data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return RestaurantDTO.model_validate(obj)

    def get(self, id: uuid.UUID) -> RestaurantDTO | None:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return None
        return RestaurantDTO.model_validate(obj)

    def get_by_subdomain(self, subdomain: str) -> RestaurantDTO | None:
        obj = self._session.scalar(
            select(Restaurant).where(
                Restaurant.subdomain == subdomain,
                Restaurant.is_active.is_(True),
            )
        )
        return RestaurantDTO.model_validate(obj) if obj else None

    def list(self, params: PaginationParams) -> CursorPage[RestaurantDTO]:
        stmt = (
            select(Restaurant)
            .where(Restaurant.is_active.is_(True))
            .order_by(Restaurant.created_at, Restaurant.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Restaurant.created_at, Restaurant.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[RestaurantDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update(self, id: uuid.UUID, data: RestaurantUpdate) -> RestaurantDTO | None:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        self._session.flush()
        return RestaurantDTO.model_validate(obj)

    def soft_delete(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    def set_schedules(self, id: uuid.UUID, schedules: Sequence[ScheduleCreate]) -> None:
        self._session.query(RestaurantSchedule).filter_by(restaurant_id=id).delete()
        for s in schedules:
            self._session.add(RestaurantSchedule(restaurant_id=id, **s.model_dump()))
        self._session.flush()

    def set_payment_methods(self, id: uuid.UUID, methods: Sequence[PaymentMethodCreate]) -> None:
        self._session.query(RestaurantPaymentMethod).filter_by(restaurant_id=id).delete()
        for m in methods:
            self._session.add(RestaurantPaymentMethod(restaurant_id=id, **m.model_dump()))
        self._session.flush()
