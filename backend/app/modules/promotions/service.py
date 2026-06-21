from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.promotions.effective import effective_status, is_promotion_effective, resolve_timezone
from app.modules.promotions.repository import PromotionRepository
from app.modules.promotions.schemas import (
    PromotionCreate,
    PromotionDTO,
    PromotionUpdate,
    enrich_promotion_dto,
)
from app.modules.promotions.types import normalize_promotion_type

_STORAGE_TYPES = {"percent", "amount", "combo", "two_for_one"}
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
        bundle = getattr(data, "bundle", None)

        if ptype is not None:
            try:
                ptype = normalize_promotion_type(ptype)
            except ValueError as exc:
                raise ValidationError(str(exc)) from exc
            if ptype not in _STORAGE_TYPES:
                raise ValidationError("Invalid promotion type")

        if scope is not None and scope not in _ALLOWED_SCOPES:
            raise ValidationError("Invalid promotion scope")
        if percent is not None and not (1 <= percent <= 100):
            raise ValidationError("percent must be between 1 and 100")
        if amount_cents is not None and amount_cents <= 0:
            raise ValidationError("amount_cents must be positive")
        if starts_at is not None and ends_at is not None and starts_at >= ends_at:
            raise ValidationError("starts_at must be before ends_at")
        if ptype == "two_for_one" or bundle is not None:
            if bundle is None:
                raise ValidationError("bundle is required for NxM promotions")
            if bundle.pay_quantity >= bundle.get_quantity:
                raise ValidationError("pay_quantity must be less than get_quantity")
            if scope == "order":
                raise ValidationError("NxM promotions must apply to products or categories")

        # Product/category links on create only; updates may send ids in the same PATCH.
        if isinstance(data, PromotionCreate) and ptype == "two_for_one" and scope in (
            "product",
            "category",
        ):
            if not data.product_ids and not data.category_ids:
                raise ValidationError(
                    "NxM promotions require at least one product or category"
                )

        if isinstance(data, PromotionUpdate) and ptype == "two_for_one" and scope in (
            "product",
            "category",
        ):
            product_ids = (
                data.product_ids
                if "product_ids" in data.model_fields_set
                else None
            )
            category_ids = (
                data.category_ids
                if "category_ids" in data.model_fields_set
                else None
            )
            if product_ids is not None or category_ids is not None:
                if not (product_ids or []) and not (category_ids or []):
                    raise ValidationError(
                        "NxM promotions require at least one product or category"
                    )

    def _with_status(self, dto: PromotionDTO, timezone: str) -> PromotionDTO:
        tz = resolve_timezone(timezone)
        now = datetime.now(UTC)
        dto.effective_status = effective_status(dto, now, tz)
        return enrich_promotion_dto(dto)

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

    def list_for_admin(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        timezone: str,
    ) -> CursorPage[PromotionDTO]:
        page = self._repo.list_active(restaurant_id, params)
        page.items = [self._with_status(item, timezone) for item in page.items]
        return page

    def list_effective_public(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        timezone: str,
    ) -> list[PromotionDTO]:
        page = self._repo.list_active(restaurant_id, params)
        tz = resolve_timezone(timezone)
        now = datetime.now(UTC)
        return [enrich_promotion_dto(p) for p in page.items if is_promotion_effective(p, now, tz)]

    def update(
        self,
        restaurant_id: uuid.UUID,
        promotion_id: uuid.UUID,
        data: PromotionUpdate,
        *,
        timezone: str,
    ) -> PromotionDTO:
        self.get(restaurant_id, promotion_id)
        self._validate(data)
        dto = self._repo.update(promotion_id, data)
        if dto is None:
            raise NotFoundError("Promotion not found")
        return self._with_status(dto, timezone)

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

    def set_option_items(
        self, restaurant_id: uuid.UUID, promotion_id: uuid.UUID, option_item_ids: list[uuid.UUID]
    ) -> None:
        self.get(restaurant_id, promotion_id)
        self._repo.set_option_items(promotion_id, option_item_ids)
