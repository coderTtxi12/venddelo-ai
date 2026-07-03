"""Load product photos from tenant storage for vision analysis."""

from __future__ import annotations

import uuid

from app.core.storage import StorageError, StoragePort
from app.modules.menu.schemas import ProductDTO


def product_image_media_type(path: str) -> str:
    lowered = path.lower()
    if lowered.endswith(".webp"):
        return "image/webp"
    if lowered.endswith(".png"):
        return "image/png"
    if lowered.endswith(".jpg") or lowered.endswith(".jpeg"):
        return "image/jpeg"
    return "image/webp"


def load_product_image_bytes(
    storage: StoragePort,
    product: ProductDTO,
) -> tuple[bytes, str]:
    image_path = (product.image_path or "").strip()
    if not image_path:
        raise StorageError("Product has no image_path")
    try:
        data = storage.read(image_path)
    except StorageError as exc:
        raise StorageError(f"Could not read product image at {image_path}") from exc
    return data, product_image_media_type(image_path)


def product_has_image_path(product: ProductDTO) -> bool:
    return bool((product.image_path or "").strip())
