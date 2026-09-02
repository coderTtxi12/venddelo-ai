from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError
from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.coupons import (
    Coupon,
    CouponRedemption,
    coupon_categories,
    coupon_products,
)
from app.db.models.orders import Order
from app.modules.coupons.repository import CouponRepository
from app.modules.coupons.schemas import CouponApplicationDTO, CouponCreate, CouponDTO, CouponUpdate


class SqlAlchemyCouponRepository(CouponRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def _product_ids(self, coupon_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.scalars(
                select(coupon_products.c.product_id).where(
                    coupon_products.c.coupon_id == coupon_id
                )
            )
        )

    def _category_ids(self, coupon_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.scalars(
                select(coupon_categories.c.category_id).where(
                    coupon_categories.c.coupon_id == coupon_id
                )
            )
        )

    def _redemption_counts_batch(
        self, coupon_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        if not coupon_ids:
            return {}
        rows = self._session.execute(
            select(
                CouponRedemption.coupon_id,
                func.count(CouponRedemption.id),
            ).where(CouponRedemption.coupon_id.in_(coupon_ids)).group_by(
                CouponRedemption.coupon_id
            )
        ).all()
        return {row.coupon_id: row[1] for row in rows}

    def _product_ids_by_coupon_batch(
        self, coupon_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        if not coupon_ids:
            return {}
        rows = self._session.execute(
            select(coupon_products.c.coupon_id, coupon_products.c.product_id).where(
                coupon_products.c.coupon_id.in_(coupon_ids)
            )
        ).all()
        result: dict[uuid.UUID, list[uuid.UUID]] = {coupon_id: [] for coupon_id in coupon_ids}
        for row in rows:
            result[row.coupon_id].append(row.product_id)
        return result

    def _category_ids_by_coupon_batch(
        self, coupon_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        if not coupon_ids:
            return {}
        rows = self._session.execute(
            select(coupon_categories.c.coupon_id, coupon_categories.c.category_id).where(
                coupon_categories.c.coupon_id.in_(coupon_ids)
            )
        ).all()
        result: dict[uuid.UUID, list[uuid.UUID]] = {coupon_id: [] for coupon_id in coupon_ids}
        for row in rows:
            result[row.coupon_id].append(row.category_id)
        return result

    def _to_dto(self, obj: Coupon, redeemed_count: int | None = None) -> CouponDTO:
        dto = CouponDTO.model_validate(obj)
        dto.product_ids = self._product_ids(obj.id)
        dto.category_ids = self._category_ids(obj.id)
        dto.redeemed_count = redeemed_count if redeemed_count is not None else self.redemption_count(
            obj.id
        )
        return dto

    def _to_dtos_batch(self, objs: list[Coupon]) -> list[CouponDTO]:
        if not objs:
            return []
        coupon_ids = [obj.id for obj in objs]
        counts = self._redemption_counts_batch(coupon_ids)
        products_by_coupon = self._product_ids_by_coupon_batch(coupon_ids)
        categories_by_coupon = self._category_ids_by_coupon_batch(coupon_ids)
        dtos: list[CouponDTO] = []
        for obj in objs:
            dto = CouponDTO.model_validate(obj)
            dto.product_ids = products_by_coupon.get(obj.id, [])
            dto.category_ids = categories_by_coupon.get(obj.id, [])
            dto.redeemed_count = counts.get(obj.id, 0)
            dtos.append(dto)
        return dtos

    def add(self, data: CouponCreate) -> CouponDTO:
        payload = data.model_dump(exclude={"product_ids", "category_ids"})
        obj = Coupon(**payload)
        self._session.add(obj)
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe un cupón con ese código") from exc
        if data.product_ids:
            self.set_products(obj.id, data.product_ids)
        if data.category_ids:
            self.set_categories(obj.id, data.category_ids)
        self._session.refresh(obj)
        return self._to_dto(obj, redeemed_count=0)

    def get(self, id: uuid.UUID) -> CouponDTO | None:
        obj = self._session.get(Coupon, id)
        if obj is None or obj.deleted_at is not None:
            return None
        return self._to_dto(obj)

    def get_by_code(self, restaurant_id: uuid.UUID, code: str) -> CouponDTO | None:
        obj = self._session.scalar(
            select(Coupon).where(
                Coupon.restaurant_id == restaurant_id,
                Coupon.code == code,
                Coupon.deleted_at.is_(None),
            )
        )
        if obj is None:
            return None
        return self._to_dto(obj)

    def list_for_admin(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CouponDTO]:
        stmt = (
            select(Coupon)
            .where(
                Coupon.restaurant_id == restaurant_id,
                Coupon.deleted_at.is_(None),
            )
            .order_by(Coupon.created_at, Coupon.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Coupon.created_at, Coupon.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=self._to_dtos_batch(rows),
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update(self, id: uuid.UUID, data: CouponUpdate) -> CouponDTO | None:
        obj = self._session.get(Coupon, id)
        if obj is None or obj.deleted_at is not None:
            return None
        for field, value in data.model_dump(
            exclude_unset=True,
            exclude={"product_ids", "category_ids"},
        ).items():
            setattr(obj, field, value)
        if "product_ids" in data.model_fields_set:
            self.set_products(id, data.product_ids or [])
        if "category_ids" in data.model_fields_set:
            self.set_categories(id, data.category_ids or [])
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe un cupón con ese código") from exc
        return self._to_dto(obj)

    def soft_delete(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Coupon, id)
        if obj is None or obj.deleted_at is not None:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    def set_products(self, coupon_id: uuid.UUID, product_ids: list[uuid.UUID]) -> None:
        self._session.execute(
            delete(coupon_products).where(coupon_products.c.coupon_id == coupon_id)
        )
        if product_ids:
            self._session.execute(
                coupon_products.insert(),
                [{"coupon_id": coupon_id, "product_id": pid} for pid in product_ids],
            )
        self._session.flush()

    def set_categories(self, coupon_id: uuid.UUID, category_ids: list[uuid.UUID]) -> None:
        self._session.execute(
            delete(coupon_categories).where(coupon_categories.c.coupon_id == coupon_id)
        )
        if category_ids:
            self._session.execute(
                coupon_categories.insert(),
                [{"coupon_id": coupon_id, "category_id": cid} for cid in category_ids],
            )
        self._session.flush()

    def redeem(self, coupon_id: uuid.UUID, order_id: uuid.UUID) -> None:
        stmt = insert(CouponRedemption).values(
            coupon_id=coupon_id,
            order_id=order_id,
        ).on_conflict_do_nothing(index_elements=["order_id"])
        self._session.execute(stmt)
        self._session.flush()

    def redemption_count(self, coupon_id: uuid.UUID) -> int:
        return int(
            self._session.scalar(
                select(func.count()).select_from(CouponRedemption).where(
                    CouponRedemption.coupon_id == coupon_id
                )
            )
            or 0
        )

    def _redeemed_order_ids(self, order_ids: list[uuid.UUID]) -> set[uuid.UUID]:
        if not order_ids:
            return set()
        rows = self._session.scalars(
            select(CouponRedemption.order_id).where(CouponRedemption.order_id.in_(order_ids))
        )
        return set(rows)

    def list_applications(
        self, coupon_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CouponApplicationDTO]:
        stmt = (
            select(Order)
            .where(Order.applied_coupon_id == coupon_id)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Order.created_at, Order.id) < (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        redeemed_ids = self._redeemed_order_ids([row.id for row in rows])
        items = [
            CouponApplicationDTO(
                order_id=row.id,
                customer_name=row.customer_name,
                customer_phone=row.customer_phone,
                status=row.status,
                total_cents=row.total_cents,
                coupon_discount_cents=row.coupon_discount_cents,
                created_at=row.created_at,
                redeemed=row.id in redeemed_ids,
            )
            for row in rows
        ]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(items=items, next_cursor=next_cursor, has_more=has_more)
