"""Storage path rules for generic assistant import inbox and asset promotion."""

from __future__ import annotations

import uuid

from app.core.exceptions import ValidationError
from app.core.storage import StoragePort
from app.modules.assistant.image_webp import WEBP_CONTENT_TYPE
from app.modules.assistant.skills.menu_media.storage_paths import PRODUCT_IMAGE_EXTENSION

MENU_DOCUMENT_MIMES = frozenset(
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)


def import_inbox_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/import/inbox/"


def legacy_menu_source_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/import/menu_source/"


def legacy_product_photo_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/import/product_photo/"


def products_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/products/"


def logo_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/logo/"


def cover_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/cover/"


def _owned_import_prefixes(restaurant_id: uuid.UUID) -> tuple[str, ...]:
    rid = str(restaurant_id)
    return (
        f"restaurants/{rid}/import/inbox/",
        f"restaurants/{rid}/import/menu_source/",
        f"restaurants/{rid}/import/product_photo/",
        f"restaurants/{rid}/products/",
    )


def validate_restaurant_import_path(restaurant_id: uuid.UUID, path: str) -> None:
    normalized = str(path).strip()
    if not normalized:
        raise ValidationError("storage_path is required")
    if not any(normalized.startswith(prefix) for prefix in _owned_import_prefixes(restaurant_id)):
        allowed = " or ".join(_owned_import_prefixes(restaurant_id))
        raise ValidationError(f"Storage path must start with {allowed}")


def validate_assignable_image_path(restaurant_id: uuid.UUID, path: str) -> None:
    normalized = str(path).strip()
    if not normalized:
        raise ValidationError("storage_path or image_path is required")
    prefixes = (
        import_inbox_prefix(restaurant_id),
        legacy_product_photo_prefix(restaurant_id),
        products_prefix(restaurant_id),
    )
    if not any(normalized.startswith(prefix) for prefix in prefixes):
        allowed = " or ".join(prefixes)
        raise ValidationError(f"Storage path must start with {allowed}")


def validate_menu_import_source_path(
    restaurant_id: uuid.UUID,
    path: str,
    mime_type: str,
) -> None:
    validate_restaurant_import_path(restaurant_id, path)
    mime = mime_type.strip().lower()
    if mime in MENU_DOCUMENT_MIMES or mime.startswith("image/"):
        return
    raise ValidationError(f"Unsupported menu source mime type: {mime_type}")


def resolve_product_image_path(
    storage: StoragePort,
    restaurant_id: uuid.UUID,
    source_path: str,
) -> str:
    """Copy inbox/legacy uploads into products/ before persisting on a product."""
    validate_assignable_image_path(restaurant_id, source_path)
    normalized = source_path.strip()
    final_prefix = products_prefix(restaurant_id)
    if normalized.startswith(final_prefix):
        return normalized

    try:
        data = storage.read(normalized)
    except Exception as exc:
        raise ValidationError(f"Could not read image at {normalized}") from exc

    destination = f"{final_prefix}{uuid.uuid4()}.{PRODUCT_IMAGE_EXTENSION}"
    stored = storage.upload(destination, data, WEBP_CONTENT_TYPE)
    return stored.path


def validate_assignable_branding_path(
    restaurant_id: uuid.UUID,
    path: str,
    *,
    folder: str,
) -> None:
    normalized = str(path).strip()
    if not normalized:
        raise ValidationError("storage_path is required")
    if folder not in {"logo", "cover"}:
        raise ValidationError("folder must be logo or cover")
    target_prefix = logo_prefix(restaurant_id) if folder == "logo" else cover_prefix(restaurant_id)
    prefixes = (import_inbox_prefix(restaurant_id), target_prefix)
    if not any(normalized.startswith(prefix) for prefix in prefixes):
        allowed = " or ".join(prefixes)
        raise ValidationError(f"Storage path must start with {allowed}")


def resolve_branding_image_path(
    storage: StoragePort,
    restaurant_id: uuid.UUID,
    source_path: str,
    *,
    folder: str,
) -> str:
    """Copy inbox uploads into logo/ or cover/ before persisting on the restaurant."""
    validate_assignable_branding_path(restaurant_id, source_path, folder=folder)
    normalized = source_path.strip()
    final_prefix = logo_prefix(restaurant_id) if folder == "logo" else cover_prefix(restaurant_id)
    if normalized.startswith(final_prefix):
        return normalized

    try:
        data = storage.read(normalized)
    except Exception as exc:
        raise ValidationError(f"Could not read image at {normalized}") from exc

    destination = f"{final_prefix}{uuid.uuid4()}.{PRODUCT_IMAGE_EXTENSION}"
    stored = storage.upload(destination, data, WEBP_CONTENT_TYPE)
    return stored.path
