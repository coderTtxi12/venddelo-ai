"""Storage conventions for AI-generated promotion banners."""

from __future__ import annotations

import uuid

PROMO_BANNER_CONTENT_TYPE = "image/webp"
PROMO_BANNER_EXTENSION = "webp"
PROMO_BANNER_SIZE = "1792x1024"


def promotion_banner_storage_path(restaurant_id: uuid.UUID) -> str:
    return (
        f"restaurants/{restaurant_id}/promotions/"
        f"{uuid.uuid4()}.{PROMO_BANNER_EXTENSION}"
    )
