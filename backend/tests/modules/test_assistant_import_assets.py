import uuid
from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.core.exceptions import ValidationError
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.import_assets import (
    upload_import_asset,
    validate_import_asset_path,
)


class _SmallSourceSettings(Settings):
    menu_import_max_source_bytes: int = 64
    menu_import_max_photo_bytes: int = 32


def test_rejects_invalid_kind():
    with pytest.raises(ValidationError, match="kind must be one of"):
        upload_import_asset(
            uuid.uuid4(),
            "menu_pdf",
            "menu.pdf",
            b"%PDF-1.4",
            "application/pdf",
        )


def test_rejects_oversize_file():
    settings = _SmallSourceSettings()
    with pytest.raises(ValidationError, match="exceeds"):
        upload_import_asset(
            uuid.uuid4(),
            "menu_source",
            "menu.pdf",
            b"x" * 128,
            "application/pdf",
            settings=settings,
        )


def test_accepts_pdf_menu_source():
    restaurant_id = uuid.uuid4()
    pdf_bytes = b"%PDF-1.4 minimal"

    with patch(
        "app.modules.assistant.import_assets.build_storage",
        return_value=MemoryStorageAdapter(),
    ):
        result = upload_import_asset(
            restaurant_id,
            "menu_source",
            "menu.pdf",
            pdf_bytes,
            "application/pdf",
        )

    assert result.path.startswith(f"restaurants/{restaurant_id}/import/menu_source/")
    assert result.path.endswith(".pdf")
    assert result.public_url.startswith("memory://")
    assert result.mime_type == "application/pdf"
    assert result.size_bytes == len(pdf_bytes)
    assert result.original_name == "menu.pdf"
    assert result.kind == "menu_source"


def test_path_prefix_validation():
    restaurant_id = uuid.uuid4()
    valid_path = f"restaurants/{restaurant_id}/import/menu_source/abc.pdf"

    validate_import_asset_path(restaurant_id, valid_path, kind="menu_source")

    with pytest.raises(ValidationError, match="must start with"):
        validate_import_asset_path(restaurant_id, "restaurants/other/import/menu_source/x.pdf")

    with pytest.raises(ValidationError, match="must start with"):
        validate_import_asset_path(
            restaurant_id,
            f"restaurants/{restaurant_id}/import/product_photo/x.jpg",
            kind="menu_source",
        )
