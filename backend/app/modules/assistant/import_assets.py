"""Upload validation and storage for menu import assets."""

from __future__ import annotations

import uuid
from typing import Literal

from app.core.config import Settings, get_settings
from app.core.exceptions import ValidationError
from app.infra.storage.factory import build_storage
from app.modules.assistant.schemas import ImportAssetUploadDTO

ImportAssetKind = Literal["menu_source", "product_photo"]

ALLOWED_KINDS = frozenset({"menu_source", "product_photo"})

ALLOWED_MIMES: dict[ImportAssetKind, frozenset[str]] = {
    "menu_source": frozenset(
        {
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
        }
    ),
    "product_photo": frozenset(
        {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
        }
    ),
}

MIME_TO_EXT: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}


def import_asset_path_prefix(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/import/"


def validate_import_asset_path(
    restaurant_id: uuid.UUID,
    path: str,
    *,
    kind: ImportAssetKind | None = None,
) -> None:
    prefix = import_asset_path_prefix(restaurant_id)
    if not path.startswith(prefix):
        raise ValidationError(f"Storage path must start with {prefix}")
    if kind is not None:
        kind_prefix = f"{prefix}{kind}/"
        if not path.startswith(kind_prefix):
            raise ValidationError(f"Storage path must start with {kind_prefix}")


def _max_bytes_for_kind(kind: ImportAssetKind, settings: Settings) -> int:
    if kind == "menu_source":
        return settings.menu_import_max_source_bytes
    return settings.menu_import_max_photo_bytes


def _normalize_content_type(content_type: str) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def upload_import_asset(
    restaurant_id: uuid.UUID,
    kind: str,
    filename: str,
    content: bytes,
    content_type: str,
    *,
    settings: Settings | None = None,
) -> ImportAssetUploadDTO:
    if kind not in ALLOWED_KINDS:
        raise ValidationError(f"kind must be one of: {', '.join(sorted(ALLOWED_KINDS))}")

    typed_kind: ImportAssetKind = kind  # type: ignore[assignment]
    cfg = settings or get_settings()
    mime_type = _normalize_content_type(content_type)

    if mime_type not in ALLOWED_MIMES[typed_kind]:
        raise ValidationError(f"Content type {mime_type} is not allowed for kind {kind}")

    size_bytes = len(content)
    max_bytes = _max_bytes_for_kind(typed_kind, cfg)
    if size_bytes > max_bytes:
        limit_mb = max_bytes / (1024 * 1024)
        raise ValidationError(f"File exceeds {limit_mb:.0f} MB limit")

    ext = MIME_TO_EXT.get(mime_type)
    if ext is None:
        raise ValidationError(f"Unsupported content type: {mime_type}")

    path = f"restaurants/{restaurant_id}/import/{kind}/{uuid.uuid4()}.{ext}"
    stored = build_storage(cfg).upload(path, content, mime_type)

    return ImportAssetUploadDTO(
        path=stored.path,
        public_url=stored.public_url,
        mime_type=mime_type,
        size_bytes=size_bytes,
        original_name=filename or "upload",
        kind=typed_kind,
    )
