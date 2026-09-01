from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

from app.modules.coupons.schemas import CouponDTO, CouponUpdate
from app.modules.coupons.service import (
    CouponService,
    apply_coupon_update_scope_links,
    merge_coupon_update,
)


def _existing(**overrides) -> CouponDTO:
    defaults = dict(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        code="SAVE10",
        name="Save 10",
        type="percent",
        percent=10,
        amount_cents=None,
        scope="category",
        stock_qty=None,
        expires_on=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=[],
        category_ids=[uuid.uuid4()],
        redeemed_count=0,
    )
    defaults.update(overrides)
    return CouponDTO(**defaults)


def _validate_merged(existing: CouponDTO, patch: CouponUpdate) -> None:
    merged = merge_coupon_update(existing, patch)
    CouponService(MagicMock())._validate(merged)


def test_percent_to_amount_clears_percent():
    existing = _existing(type="percent", percent=15, amount_cents=None)
    patch = CouponUpdate(type="amount", amount_cents=500)

    merged = merge_coupon_update(existing, patch)

    assert merged.type == "amount"
    assert merged.percent is None
    assert merged.amount_cents == 500
    _validate_merged(existing, patch)


def test_amount_to_free_shipping_clears_value_fields():
    existing = _existing(type="amount", percent=None, amount_cents=1000)
    patch = CouponUpdate(type="free_shipping")

    merged = merge_coupon_update(existing, patch)

    assert merged.type == "free_shipping"
    assert merged.percent is None
    assert merged.amount_cents is None
    _validate_merged(existing, patch)


def test_scope_to_all_clears_product_and_category_ids():
    cat_id = uuid.uuid4()
    prod_id = uuid.uuid4()
    existing = _existing(
        scope="product",
        product_ids=[prod_id],
        category_ids=[],
    )
    patch = CouponUpdate(scope="all")

    merged = merge_coupon_update(existing, patch)

    assert merged.scope == "all"
    assert merged.product_ids == []
    assert merged.category_ids == []
    _validate_merged(existing, patch)


def test_category_scope_to_all_clears_category_ids():
    cat_id = uuid.uuid4()
    existing = _existing(scope="category", category_ids=[cat_id])
    patch = CouponUpdate(scope="all")

    merged = merge_coupon_update(existing, patch)

    assert merged.scope == "all"
    assert merged.category_ids == []
    _validate_merged(existing, patch)


def test_scope_to_all_persist_patch_includes_empty_link_fields():
    cat_id = uuid.uuid4()
    existing = _existing(scope="category", category_ids=[cat_id])
    data = CouponUpdate(scope="all")

    update_fields: dict = {"scope": "all"}
    apply_coupon_update_scope_links(
        update_fields,
        data=data,
        existing=existing,
        effective_scope="all",
    )
    patch = CouponUpdate(**update_fields)

    assert "product_ids" in patch.model_fields_set
    assert "category_ids" in patch.model_fields_set
    assert patch.product_ids == []
    assert patch.category_ids == []
