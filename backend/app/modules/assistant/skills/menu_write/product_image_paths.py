"""Storage path rules for product photos assigned via menu_write."""

from __future__ import annotations

import uuid

from app.core.exceptions import ValidationError


def product_image_path_prefixes(restaurant_id: uuid.UUID) -> tuple[str, ...]:
    rid = str(restaurant_id)
    return (
        f"restaurants/{rid}/import/product_photo/",
        f"restaurants/{rid}/products/",
    )


def validate_product_image_storage_path(restaurant_id: uuid.UUID, path: str) -> None:
    normalized = str(path).strip()
    if not normalized:
        raise ValidationError("storage_path or image_path is required")
    prefixes = product_image_path_prefixes(restaurant_id)
    if not any(normalized.startswith(prefix) for prefix in prefixes):
        allowed = " or ".join(prefixes)
        raise ValidationError(f"Storage path must start with {allowed}")
