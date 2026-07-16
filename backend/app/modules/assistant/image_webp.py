"""Convert uploaded raster images to WebP for assistant import inbox."""

from __future__ import annotations

import io

from PIL import Image

from app.core.exceptions import ValidationError

WEBP_CONTENT_TYPE = "image/webp"
WEBP_EXTENSION = "webp"


def convert_image_bytes_to_webp(data: bytes, *, quality: int = 85) -> bytes:
    if not data:
        raise ValidationError("Empty image file")

    try:
        with Image.open(io.BytesIO(data)) as image:
            rgba = image.convert("RGBA")
            buffer = io.BytesIO()
            rgba.save(buffer, format="WEBP", quality=quality, method=6)
            return buffer.getvalue()
    except Exception as exc:
        raise ValidationError("Could not convert image to WebP") from exc
