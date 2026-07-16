import base64
import uuid
from unittest.mock import patch

from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.import_asset_paths import import_inbox_prefix, resolve_product_image_path
from app.modules.assistant.import_assets import upload_import_asset

MINI_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)


def test_resolve_product_image_path_promotes_inbox_to_products():
    restaurant_id = uuid.uuid4()
    storage = MemoryStorageAdapter()

    with patch(
        "app.modules.assistant.import_assets.build_storage",
        return_value=storage,
    ):
        uploaded = upload_import_asset(
            restaurant_id,
            "berry.png",
            MINI_PNG,
            "image/png",
        )

    final_path = resolve_product_image_path(storage, restaurant_id, uploaded.path)
    assert final_path.startswith(f"restaurants/{restaurant_id}/products/")
    assert final_path.endswith(".webp")
    assert storage.read(final_path)
    assert uploaded.path.startswith(import_inbox_prefix(restaurant_id))
