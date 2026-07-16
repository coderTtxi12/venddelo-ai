"""Upload validation and storage for assistant import inbox assets."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.exceptions import ValidationError
from app.infra.storage.factory import build_storage
from app.modules.assistant.image_webp import WEBP_CONTENT_TYPE, convert_image_bytes_to_webp
from app.modules.assistant.import_asset_paths import import_inbox_prefix

ImportAssetKind = Literal["document", "image"]

# Legacy kinds accepted on read paths / attachment metadata during migration.
LegacyImportAssetKind = Literal["menu_source", "product_photo"]


class ImportAssetUploadDTO(BaseModel):
    path: str = Field(min_length=1)
    public_url: str = Field(min_length=1)
    mime_type: str = Field(min_length=1)
    size_bytes: int = Field(ge=0)
    original_name: str = Field(min_length=1)
    kind: ImportAssetKind


MENU_DOCUMENT_MIMES = frozenset(
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)

IMAGE_MIMES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/gif",
    }
)

MIME_TO_EXT: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/webp": "webp",
}


def _normalize_content_type(content_type: str) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def _classify_upload(mime_type: str) -> ImportAssetKind:
    if mime_type in MENU_DOCUMENT_MIMES:
        return "document"
    if mime_type in IMAGE_MIMES or mime_type.startswith("image/"):
        return "image"
    raise ValidationError(
        "Unsupported file type. Upload PDF, DOCX, or an image (JPEG, PNG, WebP, HEIC)."
    )


def _max_bytes_for_kind(kind: ImportAssetKind, settings: Settings) -> int:
    if kind == "document":
        return settings.menu_import_max_source_bytes
    return settings.menu_import_max_photo_bytes


def upload_import_asset(
    restaurant_id: uuid.UUID,
    filename: str,
    content: bytes,
    content_type: str,
    *,
    settings: Settings | None = None,
) -> ImportAssetUploadDTO:
    cfg = settings or get_settings()
    mime_type = _normalize_content_type(content_type)
    kind = _classify_upload(mime_type)

    size_bytes = len(content)
    max_bytes = _max_bytes_for_kind(kind, cfg)
    if size_bytes > max_bytes:
        limit_mb = max_bytes / (1024 * 1024)
        raise ValidationError(f"File exceeds {limit_mb:.0f} MB limit")

    if kind == "document":
        ext = MIME_TO_EXT.get(mime_type)
        if ext is None:
            raise ValidationError(f"Unsupported document type: {mime_type}")
        payload = content
        stored_mime = mime_type
    else:
        ext = "webp"
        payload = convert_image_bytes_to_webp(content)
        stored_mime = WEBP_CONTENT_TYPE
        size_bytes = len(payload)

    path = f"{import_inbox_prefix(restaurant_id)}{uuid.uuid4()}.{ext}"
    stored = build_storage(cfg).upload(path, payload, stored_mime)

    return ImportAssetUploadDTO(
        path=stored.path,
        public_url=stored.public_url,
        mime_type=stored_mime,
        size_bytes=size_bytes,
        original_name=filename or "upload",
        kind=kind,
    )


# Backward-compatible helpers used by menu import tools.
def import_asset_path_prefix(restaurant_id: uuid.UUID) -> str:
    return import_inbox_prefix(restaurant_id)


def validate_import_asset_path(
    restaurant_id: uuid.UUID,
    path: str,
    *,
    kind: ImportAssetKind | LegacyImportAssetKind | None = None,
) -> None:
    from app.modules.assistant.import_asset_paths import validate_restaurant_import_path

    validate_restaurant_import_path(restaurant_id, path)
    if kind == "menu_source":
        legacy_prefix = f"restaurants/{restaurant_id}/import/menu_source/"
        inbox = import_inbox_prefix(restaurant_id)
        if not (path.startswith(legacy_prefix) or path.startswith(inbox)):
            raise ValidationError(f"Storage path must start with {legacy_prefix} or {inbox}")
    elif kind == "product_photo":
        legacy_prefix = f"restaurants/{restaurant_id}/import/product_photo/"
        inbox = import_inbox_prefix(restaurant_id)
        products = f"restaurants/{restaurant_id}/products/"
        if not (
            path.startswith(legacy_prefix) or path.startswith(inbox) or path.startswith(products)
        ):
            raise ValidationError(
                f"Storage path must start with {legacy_prefix}, {inbox}, or {products}"
            )
