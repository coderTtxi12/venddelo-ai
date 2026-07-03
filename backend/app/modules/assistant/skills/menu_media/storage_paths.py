"""Storage conventions for AI-generated product images."""

from __future__ import annotations

import uuid

PRODUCT_IMAGE_CONTENT_TYPE = "image/webp"
PRODUCT_IMAGE_EXTENSION = "webp"


def product_image_storage_path(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/products/{uuid.uuid4()}.{PRODUCT_IMAGE_EXTENSION}"
