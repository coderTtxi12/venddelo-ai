from __future__ import annotations

import uuid

from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.promotions.repository import PromotionRepository
from app.modules.promotions.schemas import (
    PromotionCreate,
    PromotionDTO,
    PromotionUpdate,
)

_ALLOWED_TYPES = {"percent", "amount", "combo", "2x1"}
_ALLOWED_SCOPES = {"product", "category", "order"}


class PromotionService:
    def __init__(self, repo: PromotionRepository) -> None:
        self._repo = repo

    def _validate(self, data: PromotionCreate | PromotionUpdate) -> None:
        ptype = getattr(data, "type", None)
        scope = getattr(data, "scope", None)
        percent = getattr(data, "percent", None)
        amount_cents = getattr(data, "amount_cents", None)
        starts_at = getattr(data, "starts_at", None)
        ends_at = getattr(data, "ends_at", None)

        if ptype is not None and ptype not in _ALLOWED_TYPES:
            raise ValidationError("Invalid promotion type")
        if scope is not None and scope not in _ALLOWED_SCOPES:
            raise ValidationError("Invalid promotion scope")
        if percent is not None and not (1 <= percent <= 100):
            raise ValidationError("percent must be between 1 and 100")
        if amount_cents is not None and amount_cents <= 0:
            raise ValidationError("amount_cents must be positive")
        if starts_at is not None and ends_at is not None and starts_at >= ends_at:
            raise ValidationError("starts_at must be before ends_at")

    def create(self, restaurant_id: uuid.UUID, data: PromotionCreate) -> PromotionDTO:
        self._validate(data)
        payload = data.model_copy(update={"restaurant_id": restaurant_id})
        return self._repo.add(payload)

    def get(self, restaurant_id: uuid.UUID, promotion_id: uuid.UUID) -> PromotionDTO:
        dto = self._repo.get(promotion_id)
        if dto is None or dto.restaurant_id != restaurant_id:
            raise NotFoundError("Promotion not found")
        return dto

    def list_active(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[PromotionDTO]:
        return self._repo.list_active(restaurant_id, params)

    def update(
        self, restaurant_id: uuid.UUID, promotion_id: uuid.UUID, data: PromotionUpdate
    ) -> PromotionDTO:
        self.get(restaurant_id, promotion_id)
        self._validate(data)
        dto = self._repo.update(promotion_id, data)
        if dto is None:
            raise NotFoundError("Promotion not found")
        return dto

    def delete(self, restaurant_id: uuid.UUID, promotion_id: uuid.UUID) -> None:
        self.get(restaurant_id, promotion_id)
        if not self._repo.soft_delete(promotion_id):
            raise NotFoundError("Promotion not found")

    def set_products(
        self, restaurant_id: uuid.UUID, promotion_id: uuid.UUID, product_ids: list[uuid.UUID]
    ) -> None:
        self.get(restaurant_id, promotion_id)
        self._repo.set_products(promotion_id, product_ids)

    def set_categories(
        self, restaurant_id: uuid.UUID, promotion_id: uuid.UUID, category_ids: list[uuid.UUID]
    ) -> None:
        self.get(restaurant_id, promotion_id)
        self._repo.set_categories(promotion_id, category_ids)
