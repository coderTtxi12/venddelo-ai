import base64
import uuid
from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.core.exceptions import ValidationError
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.image_webp import WEBP_CONTENT_TYPE
from app.modules.assistant.import_asset_paths import import_inbox_prefix
from app.modules.assistant.import_assets import upload_import_asset, validate_import_asset_path

MINI_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)


class _SmallSourceSettings(Settings):
    menu_import_max_source_bytes: int = 64
    menu_import_max_photo_bytes: int = 32


def test_rejects_unsupported_mime():
    with pytest.raises(ValidationError, match="Unsupported file type"):
        upload_import_asset(
            uuid.uuid4(),
            "notes.txt",
            b"hello",
            "text/plain",
        )


def test_rejects_oversize_document():
    settings = _SmallSourceSettings()
    with pytest.raises(ValidationError, match="exceeds"):
        upload_import_asset(
            uuid.uuid4(),
            "menu.pdf",
            b"x" * 128,
            "application/pdf",
            settings=settings,
        )


def test_accepts_pdf_into_inbox():
    restaurant_id = uuid.uuid4()
    pdf_bytes = b"%PDF-1.4 minimal"

    with patch(
        "app.modules.assistant.import_assets.build_storage",
        return_value=MemoryStorageAdapter(),
    ):
        result = upload_import_asset(
            restaurant_id,
            "menu.pdf",
            pdf_bytes,
            "application/pdf",
        )

    assert result.path.startswith(import_inbox_prefix(restaurant_id))
    assert result.path.endswith(".pdf")
    assert result.mime_type == "application/pdf"
    assert result.kind == "document"


def test_converts_image_upload_to_webp_inbox():
    restaurant_id = uuid.uuid4()

    with patch(
        "app.modules.assistant.import_assets.build_storage",
        return_value=MemoryStorageAdapter(),
    ):
        result = upload_import_asset(
            restaurant_id,
            "berry.png",
            MINI_PNG,
            "image/png",
        )

    assert result.path.startswith(import_inbox_prefix(restaurant_id))
    assert result.path.endswith(".webp")
    assert result.mime_type == WEBP_CONTENT_TYPE
    assert result.kind == "image"
    assert result.size_bytes > 0


def test_path_prefix_validation_accepts_inbox_and_legacy():
    restaurant_id = uuid.uuid4()
    inbox_path = f"{import_inbox_prefix(restaurant_id)}abc.webp"
    legacy_path = f"restaurants/{restaurant_id}/import/menu_source/abc.pdf"

    validate_import_asset_path(restaurant_id, inbox_path)
    validate_import_asset_path(restaurant_id, legacy_path, kind="menu_source")

    with pytest.raises(ValidationError, match="must start with"):
        validate_import_asset_path(restaurant_id, "restaurants/other/import/inbox/x.webp")
