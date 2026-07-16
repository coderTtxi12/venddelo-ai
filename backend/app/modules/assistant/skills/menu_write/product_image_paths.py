"""Storage path rules for product photos assigned via menu_write."""

from __future__ import annotations

import uuid

from app.core.exceptions import ValidationError
from app.modules.assistant.import_asset_paths import validate_assignable_image_path

__all__ = [
    "product_image_path_prefixes",
    "validate_product_image_storage_path",
]


def product_image_path_prefixes(restaurant_id: uuid.UUID) -> tuple[str, ...]:
    from app.modules.assistant.import_asset_paths import (
        import_inbox_prefix,
        legacy_product_photo_prefix,
        products_prefix,
    )

    return (
        import_inbox_prefix(restaurant_id),
        legacy_product_photo_prefix(restaurant_id),
        products_prefix(restaurant_id),
    )


def validate_product_image_storage_path(restaurant_id: uuid.UUID, path: str) -> None:
    validate_assignable_image_path(restaurant_id, path)
