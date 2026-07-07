"""Product visibility status (single column on ``products``)."""

from __future__ import annotations

from typing import Literal

ProductStatus = Literal["active", "inactive", "draft"]

PRODUCT_STATUSES: frozenset[str] = frozenset({"active", "inactive", "draft"})


def legacy_product_status(
    *,
    is_published: bool,
    approval_status: str,
    is_active: bool,
) -> ProductStatus:
    """Map legacy visibility flags to the unified ``status`` column."""
    if is_published and approval_status == "approved":
        return "active" if is_active else "inactive"
    return "draft"


def is_public_menu_listed(status: str) -> bool:
    return status in {"active", "inactive"}


def is_orderable(status: str) -> bool:
    return status == "active"
