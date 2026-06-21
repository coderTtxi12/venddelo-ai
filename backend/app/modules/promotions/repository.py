from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.core.pagination import CursorPage, PaginationParams
from app.modules.promotions.schemas import (
    PromotionCreate,
    PromotionDTO,
    PromotionUpdate,
)


class PromotionRepository(ABC):
    @abstractmethod
    def add(self, data: PromotionCreate) -> PromotionDTO: ...

    @abstractmethod
    def get(self, id: uuid.UUID) -> PromotionDTO | None: ...

    @abstractmethod
    def list_active(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[PromotionDTO]: ...

    @abstractmethod
    def update(self, id: uuid.UUID, data: PromotionUpdate) -> PromotionDTO | None: ...

    @abstractmethod
    def soft_delete(self, id: uuid.UUID) -> bool: ...

    @abstractmethod
    def set_products(self, promotion_id: uuid.UUID, product_ids: list[uuid.UUID]) -> None: ...

    @abstractmethod
    def set_categories(self, promotion_id: uuid.UUID, category_ids: list[uuid.UUID]) -> None: ...

    @abstractmethod
    def set_option_items(self, promotion_id: uuid.UUID, option_item_ids: list[uuid.UUID]) -> None: ...
