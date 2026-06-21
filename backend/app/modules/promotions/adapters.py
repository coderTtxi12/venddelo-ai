from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, tuple_
from sqlalchemy.orm import Session

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.promotions import (
    Promotion,
    promotion_categories,
    promotion_option_items,
    promotion_products,
)
from app.modules.promotions.repository import PromotionRepository
from app.modules.promotions.schemas import (
    PromotionCreate,
    PromotionDTO,
    PromotionUpdate,
    _parse_hhmm,
    enrich_promotion_dto,
)


def _storage_fields_from_create(data: PromotionCreate) -> dict:
    payload = data.model_dump(
        exclude={"product_ids", "category_ids", "option_item_ids", "bundle", "schedule"},
    )
    if data.bundle:
        payload["bundle_get_quantity"] = data.bundle.get_quantity
        payload["bundle_pay_quantity"] = data.bundle.pay_quantity
        payload["bundle_pairing_mode"] = data.bundle.pairing_mode
    if data.schedule:
        payload["recurrence_weekdays"] = data.schedule.weekdays or None
        if data.schedule.use_time_window:
            payload["recurrence_start_time"] = _parse_hhmm(data.schedule.daily_start_time)
            payload["recurrence_end_time"] = _parse_hhmm(data.schedule.daily_end_time)
        else:
            payload["recurrence_start_time"] = None
            payload["recurrence_end_time"] = None
    return payload


def _storage_fields_from_update(data: PromotionUpdate) -> dict:
    payload = data.model_dump(
        exclude_unset=True,
        exclude={"bundle", "schedule", "product_ids", "category_ids", "option_item_ids"},
    )
    if data.bundle is not None:
        payload["bundle_get_quantity"] = data.bundle.get_quantity
        payload["bundle_pay_quantity"] = data.bundle.pay_quantity
        payload["bundle_pairing_mode"] = data.bundle.pairing_mode
    if data.schedule is not None:
        payload["recurrence_weekdays"] = data.schedule.weekdays or None
        if data.schedule.use_time_window:
            payload["recurrence_start_time"] = _parse_hhmm(data.schedule.daily_start_time)
            payload["recurrence_end_time"] = _parse_hhmm(data.schedule.daily_end_time)
        else:
            payload["recurrence_start_time"] = None
            payload["recurrence_end_time"] = None
    return payload


class SqlAlchemyPromotionRepository(PromotionRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def _product_ids(self, promotion_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.scalars(
                select(promotion_products.c.product_id).where(
                    promotion_products.c.promotion_id == promotion_id
                )
            )
        )

    def _category_ids(self, promotion_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.scalars(
                select(promotion_categories.c.category_id).where(
                    promotion_categories.c.promotion_id == promotion_id
                )
            )
        )

    def _option_item_ids(self, promotion_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.scalars(
                select(promotion_option_items.c.option_item_id).where(
                    promotion_option_items.c.promotion_id == promotion_id
                )
            )
        )

    def _to_dto(self, obj: Promotion) -> PromotionDTO:
        dto = PromotionDTO.model_validate(obj)
        dto.product_ids = self._product_ids(obj.id)
        dto.category_ids = self._category_ids(obj.id)
        dto.option_item_ids = self._option_item_ids(obj.id)
        return enrich_promotion_dto(dto)

    def add(self, data: PromotionCreate) -> PromotionDTO:
        payload = _storage_fields_from_create(data)
        obj = Promotion(**payload)
        self._session.add(obj)
        self._session.flush()
        if data.product_ids:
            self.set_products(obj.id, data.product_ids)
        if data.category_ids:
            self.set_categories(obj.id, data.category_ids)
        if data.option_item_ids:
            self.set_option_items(obj.id, data.option_item_ids)
        self._session.refresh(obj)
        return self._to_dto(obj)

    def get(self, id: uuid.UUID) -> PromotionDTO | None:
        obj = self._session.get(Promotion, id)
        if obj is None or not obj.is_active:
            return None
        return self._to_dto(obj)

    def list_active(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[PromotionDTO]:
        stmt = (
            select(Promotion)
            .where(
                Promotion.restaurant_id == restaurant_id,
                Promotion.is_active.is_(True),
            )
            .order_by(Promotion.created_at, Promotion.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Promotion.created_at, Promotion.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[self._to_dto(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update(self, id: uuid.UUID, data: PromotionUpdate) -> PromotionDTO | None:
        obj = self._session.get(Promotion, id)
        if obj is None or not obj.is_active:
            return None
        for field, value in _storage_fields_from_update(data).items():
            setattr(obj, field, value)
        if "product_ids" in data.model_fields_set:
            self.set_products(id, data.product_ids or [])
        if "category_ids" in data.model_fields_set:
            self.set_categories(id, data.category_ids or [])
        if "option_item_ids" in data.model_fields_set:
            self.set_option_items(id, data.option_item_ids or [])
        self._session.flush()
        return self._to_dto(obj)

    def soft_delete(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Promotion, id)
        if obj is None or not obj.is_active:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    def set_products(self, promotion_id: uuid.UUID, product_ids: list[uuid.UUID]) -> None:
        self._session.execute(
            delete(promotion_products).where(promotion_products.c.promotion_id == promotion_id)
        )
        if product_ids:
            self._session.execute(
                promotion_products.insert(),
                [{"promotion_id": promotion_id, "product_id": pid} for pid in product_ids],
            )
        self._session.flush()

    def set_categories(self, promotion_id: uuid.UUID, category_ids: list[uuid.UUID]) -> None:
        self._session.execute(
            delete(promotion_categories).where(promotion_categories.c.promotion_id == promotion_id)
        )
        if category_ids:
            self._session.execute(
                promotion_categories.insert(),
                [{"promotion_id": promotion_id, "category_id": cid} for cid in category_ids],
            )
        self._session.flush()

    def set_option_items(self, promotion_id: uuid.UUID, option_item_ids: list[uuid.UUID]) -> None:
        self._session.execute(
            delete(promotion_option_items).where(
                promotion_option_items.c.promotion_id == promotion_id
            )
        )
        if option_item_ids:
            self._session.execute(
                promotion_option_items.insert(),
                [
                    {"promotion_id": promotion_id, "option_item_id": oid}
                    for oid in option_item_ids
                ],
            )
        self._session.flush()
