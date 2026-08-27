from __future__ import annotations

import uuid
from urllib.parse import urlparse

from app.core.exceptions import ValidationError

MAX_RIDER_APK_BYTES = 80 * 1024 * 1024
_APK_MAGIC = b"PK"
APK_CONTENT_TYPE = "application/vnd.android.package-archive"


def validate_rider_apk_filename(filename: str | None) -> str:
    name = (filename or "").strip()
    if not name.lower().endswith(".apk"):
        raise ValidationError("El archivo debe ser un APK (.apk)")
    return name.split("/")[-1].split("\\")[-1]


def validate_rider_apk_size(size: int) -> int:
    if size <= 0:
        raise ValidationError("El archivo está vacío")
    if size > MAX_RIDER_APK_BYTES:
        raise ValidationError("El APK no puede pesar más de 80 MB")
    return size


def validate_rider_apk_bytes(payload: bytes) -> bytes:
    validate_rider_apk_size(len(payload))
    if not payload.startswith(_APK_MAGIC):
        raise ValidationError("El archivo no parece un APK válido")
    return payload


def validate_rider_apk_url(url: str) -> str:
    stripped = url.strip()
    parsed = urlparse(stripped)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValidationError("La URL debe ser http o https")
    return stripped
