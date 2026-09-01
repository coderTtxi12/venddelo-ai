from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.coupons.pricing import CouponInput, normalize_coupon_code
from app.modules.coupons.repository import CouponRepository
from app.modules.coupons.schemas import CouponCreate, CouponDTO, CouponUpdate
from app.modules.coupons.status import coupon_effective_status, remaining_qty
from app.modules.promotions.effective import resolve_timezone

_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,32}$")
_ALLOWED_TYPES = {"amount", "percent", "free_shipping"}
_ALLOWED_SCOPES = {"all", "category", "product"}
_DEFAULT_TIMEZONE = "America/Mexico_City"


class CouponService:
    def __init__(self, repo: CouponRepository) -> None:
        self._repo = repo

    def _validate(self, data: CouponCreate | CouponUpdate) -> None:
        code = getattr(data, "code", None)
        if code is not None:
            stripped = code.strip()
            if not _CODE_PATTERN.match(stripped):
                raise ValidationError("Invalid coupon code")
        name = getattr(data, "name", None)
        if name is not None and not str(name).strip():
            raise ValidationError("name is required")

        ptype = getattr(data, "type", None)
        scope = getattr(data, "scope", None)
        percent = getattr(data, "percent", None)
        amount_cents = getattr(data, "amount_cents", None)
        product_ids = getattr(data, "product_ids", None)
        category_ids = getattr(data, "category_ids", None)

        if ptype is not None and ptype not in _ALLOWED_TYPES:
            raise ValidationError("Invalid coupon type")
        if scope is not None and scope not in _ALLOWED_SCOPES:
            raise ValidationError("Invalid coupon scope")

        if ptype == "percent":
            if percent is None or not (1 <= percent <= 100):
                raise ValidationError("percent must be between 1 and 100")
            if amount_cents is not None:
                raise ValidationError("amount_cents must be null for percent coupons")
        elif ptype == "amount":
            if amount_cents is None or amount_cents <= 0:
                raise ValidationError("amount_cents must be positive")
            if percent is not None:
                raise ValidationError("percent must be null for amount coupons")
        elif ptype == "free_shipping":
            if percent is not None or amount_cents is not None:
                raise ValidationError("free_shipping coupons must not have percent or amount_cents")

        effective_scope = scope
        if isinstance(data, CouponUpdate) and effective_scope is None:
            effective_scope = None
        if effective_scope == "product":
            ids = product_ids if product_ids is not None else []
            if isinstance(data, CouponCreate):
                ids = data.product_ids
            if not ids:
                raise ValidationError("product_ids required for product scope")
        elif effective_scope == "category":
            ids = category_ids if category_ids is not None else []
            if isinstance(data, CouponCreate):
                ids = data.category_ids
            if not ids:
                raise ValidationError("category_ids required for category scope")
        elif effective_scope == "all" and isinstance(data, CouponCreate):
            if data.product_ids or data.category_ids:
                raise ValidationError("all scope must not have product or category links")

        if isinstance(data, CouponUpdate):
            if "product_ids" in data.model_fields_set and data.product_ids:
                if scope == "all":
                    raise ValidationError("all scope must not have product links")
            if "category_ids" in data.model_fields_set and data.category_ids:
                if scope == "all":
                    raise ValidationError("all scope must not have category links")

    def _with_status(self, dto: CouponDTO, timezone: str | None) -> CouponDTO:
        tz = resolve_timezone(timezone or _DEFAULT_TIMEZONE)
        today = datetime.now(UTC).astimezone(tz).date()
        dto.remaining_qty = remaining_qty(dto.stock_qty, dto.redeemed_count)
        dto.effective_status = coupon_effective_status(
            dto.is_active,
            dto.expires_on,
            dto.stock_qty,
            dto.redeemed_count,
            today,
        )
        return dto

    def _prepare_create(self, restaurant_id: uuid.UUID, data: CouponCreate) -> CouponCreate:
        self._validate(data)
        code = normalize_coupon_code(data.code)
        if code is None:
            raise ValidationError("Invalid coupon code")
        if self._repo.get_by_code(restaurant_id, code):
            raise ConflictError("Coupon code already exists")
        product_ids = data.product_ids if data.scope == "product" else []
        category_ids = data.category_ids if data.scope == "category" else []
        payload: dict = {
            "restaurant_id": restaurant_id,
            "code": code,
            "name": data.name.strip(),
            "type": data.type,
            "scope": data.scope,
            "stock_qty": data.stock_qty,
            "expires_on": data.expires_on,
            "is_active": data.is_active,
            "product_ids": product_ids,
            "category_ids": category_ids,
        }
        if data.type == "percent":
            payload["percent"] = data.percent
            payload["amount_cents"] = None
        elif data.type == "amount":
            payload["amount_cents"] = data.amount_cents
            payload["percent"] = None
        else:
            payload["percent"] = None
            payload["amount_cents"] = None
        return CouponCreate(**payload)

    def create(
        self, restaurant_id: uuid.UUID, data: CouponCreate, *, timezone: str | None = None
    ) -> CouponDTO:
        payload = self._prepare_create(restaurant_id, data)
        dto = self._repo.add(payload)
        return self._with_status(dto, timezone)

    def get(
        self, restaurant_id: uuid.UUID, coupon_id: uuid.UUID, *, timezone: str | None = None
    ) -> CouponDTO:
        dto = self._repo.get(coupon_id)
        if dto is None or dto.restaurant_id != restaurant_id:
            raise NotFoundError("Coupon not found")
        return self._with_status(dto, timezone)

    def list(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        timezone: str | None = None,
    ) -> CursorPage[CouponDTO]:
        page = self._repo.list_for_admin(restaurant_id, params)
        tz = timezone or _DEFAULT_TIMEZONE
        page.items = [self._with_status(item, tz) for item in page.items]
        return page

    def update(
        self,
        restaurant_id: uuid.UUID,
        coupon_id: uuid.UUID,
        data: CouponUpdate,
        *,
        timezone: str | None = None,
    ) -> CouponDTO:
        existing = self.get(restaurant_id, coupon_id, timezone=timezone)
        merged_scope = data.scope if data.scope is not None else existing.scope
        merged_type = data.type if data.type is not None else existing.type
        validate_payload = CouponCreate(
            code=data.code if data.code is not None else existing.code,
            name=data.name if data.name is not None else existing.name,
            type=merged_type,
            percent=data.percent if "percent" in data.model_fields_set else existing.percent,
            amount_cents=(
                data.amount_cents if "amount_cents" in data.model_fields_set else existing.amount_cents
            ),
            scope=merged_scope,
            stock_qty=data.stock_qty if "stock_qty" in data.model_fields_set else existing.stock_qty,
            expires_on=(
                data.expires_on if "expires_on" in data.model_fields_set else existing.expires_on
            ),
            is_active=data.is_active if data.is_active is not None else existing.is_active,
            product_ids=(
                data.product_ids
                if "product_ids" in data.model_fields_set
                else existing.product_ids
            ),
            category_ids=(
                data.category_ids
                if "category_ids" in data.model_fields_set
                else existing.category_ids
            ),
        )
        self._validate(validate_payload)

        update_fields: dict = {}
        if data.code is not None:
            code = normalize_coupon_code(data.code)
            if code is None:
                raise ValidationError("Invalid coupon code")
            if code != existing.code and self._repo.get_by_code(restaurant_id, code):
                raise ConflictError("Coupon code already exists")
            update_fields["code"] = code
        if data.name is not None:
            update_fields["name"] = data.name.strip()
        if data.type is not None:
            update_fields["type"] = data.type
        if "percent" in data.model_fields_set:
            update_fields["percent"] = data.percent
        if "amount_cents" in data.model_fields_set:
            update_fields["amount_cents"] = data.amount_cents
        if data.scope is not None:
            update_fields["scope"] = data.scope
        if "stock_qty" in data.model_fields_set:
            update_fields["stock_qty"] = data.stock_qty
        if "expires_on" in data.model_fields_set:
            update_fields["expires_on"] = data.expires_on
        if data.is_active is not None:
            update_fields["is_active"] = data.is_active

        effective_type = update_fields.get("type", existing.type)
        if effective_type == "percent":
            update_fields["amount_cents"] = None
            if "percent" not in update_fields:
                update_fields["percent"] = existing.percent
        elif effective_type == "amount":
            update_fields["percent"] = None
            if "amount_cents" not in update_fields:
                update_fields["amount_cents"] = existing.amount_cents
        elif effective_type == "free_shipping":
            update_fields["percent"] = None
            update_fields["amount_cents"] = None

        effective_scope = update_fields.get("scope", existing.scope)
        patch = CouponUpdate(**update_fields)
        if "product_ids" in data.model_fields_set:
            patch.product_ids = (
                data.product_ids if effective_scope == "product" else []
            )
        elif effective_scope != existing.scope:
            patch.product_ids = existing.product_ids if effective_scope == "product" else []
        if "category_ids" in data.model_fields_set:
            patch.category_ids = (
                data.category_ids if effective_scope == "category" else []
            )
        elif effective_scope != existing.scope:
            patch.category_ids = existing.category_ids if effective_scope == "category" else []

        dto = self._repo.update(coupon_id, patch)
        if dto is None:
            raise NotFoundError("Coupon not found")
        return self._with_status(dto, timezone)

    def soft_delete(self, restaurant_id: uuid.UUID, coupon_id: uuid.UUID) -> None:
        self.get(restaurant_id, coupon_id)
        if not self._repo.soft_delete(coupon_id):
            raise NotFoundError("Coupon not found")

    def to_input(self, dto: CouponDTO) -> CouponInput:
        return CouponInput(
            id=dto.id,
            code=dto.code,
            type=dto.type,
            percent=dto.percent,
            amount_cents=dto.amount_cents,
            scope=dto.scope,
            product_ids=list(dto.product_ids),
            category_ids=list(dto.category_ids),
            stock_qty=dto.stock_qty,
            expires_on=dto.expires_on,
            is_active=dto.is_active,
            redemption_count=dto.redeemed_count,
        )

    def resolve_public(
        self, restaurant_id: uuid.UUID, code: str, *, timezone: str | None = None
    ) -> CouponDTO | None:
        normalized = normalize_coupon_code(code)
        if normalized is None:
            return None
        dto = self._repo.get_by_code(restaurant_id, normalized)
        if dto is None:
            return None
        return self._with_status(dto, timezone)
