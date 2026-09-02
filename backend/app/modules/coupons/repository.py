from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.core.pagination import CursorPage, PaginationParams
from app.modules.coupons.schemas import CouponCreate, CouponApplicationDTO, CouponDTO, CouponUpdate


class CouponRepository(ABC):
    @abstractmethod
    def add(self, data: CouponCreate) -> CouponDTO: ...

    @abstractmethod
    def get(self, id: uuid.UUID) -> CouponDTO | None: ...

    @abstractmethod
    def get_by_code(self, restaurant_id: uuid.UUID, code: str) -> CouponDTO | None: ...

    @abstractmethod
    def list_for_admin(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CouponDTO]: ...

    @abstractmethod
    def update(self, id: uuid.UUID, data: CouponUpdate) -> CouponDTO | None: ...

    @abstractmethod
    def soft_delete(self, id: uuid.UUID) -> bool: ...

    @abstractmethod
    def set_products(self, coupon_id: uuid.UUID, product_ids: list[uuid.UUID]) -> None: ...

    @abstractmethod
    def set_categories(self, coupon_id: uuid.UUID, category_ids: list[uuid.UUID]) -> None: ...

    @abstractmethod
    def redeem(self, coupon_id: uuid.UUID, order_id: uuid.UUID) -> None: ...

    @abstractmethod
    def redemption_count(self, coupon_id: uuid.UUID) -> int: ...

    @abstractmethod
    def list_applications(
        self, coupon_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CouponApplicationDTO]: ...
