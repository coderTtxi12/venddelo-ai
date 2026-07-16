import uuid
from unittest.mock import patch

import pytest

from app.core.exceptions import ValidationError
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.import_asset_paths import (
    cover_prefix,
    logo_prefix,
    resolve_branding_image_path,
)
from app.modules.assistant.import_assets import upload_import_asset
import base64

MINI_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)


def test_resolve_branding_image_path_promotes_inbox_to_logo():
    restaurant_id = uuid.uuid4()
    storage = MemoryStorageAdapter()

    with patch(
        "app.modules.assistant.import_assets.build_storage",
        return_value=storage,
    ):
        uploaded = upload_import_asset(restaurant_id, "logo.png", MINI_PNG, "image/png")

    final_path = resolve_branding_image_path(
        storage,
        restaurant_id,
        uploaded.path,
        folder="logo",
    )
    assert final_path.startswith(logo_prefix(restaurant_id))
    assert storage.read(final_path)


def test_resolve_branding_image_path_keeps_existing_cover_path():
    restaurant_id = uuid.uuid4()
    storage = MemoryStorageAdapter()
    existing = f"{cover_prefix(restaurant_id)}existing.webp"
    storage.upload(existing, b"cover", "image/webp")

    assert (
        resolve_branding_image_path(storage, restaurant_id, existing, folder="cover")
        == existing
    )


def test_resolve_branding_image_path_rejects_foreign_path():
    restaurant_id = uuid.uuid4()
    storage = MemoryStorageAdapter()
    with pytest.raises(ValidationError, match="must start with"):
        resolve_branding_image_path(
            storage,
            restaurant_id,
            "restaurants/other/import/inbox/x.webp",
            folder="logo",
        )
