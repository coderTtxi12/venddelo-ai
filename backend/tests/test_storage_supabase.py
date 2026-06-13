import uuid

import pytest

from app.core.config import get_settings
from app.core.storage import StoredObject

settings = get_settings()

requires_supabase = pytest.mark.skipif(
    not (settings.supabase_url and settings.supabase_service_role_key),
    reason="Supabase credentials not configured",
)


@requires_supabase
def test_storage_round_trip():
    from app.infra.storage.supabase_storage import SupabaseStorageAdapter

    adapter = SupabaseStorageAdapter(settings)
    path = f"smoke/{uuid.uuid4()}.txt"
    obj = adapter.upload(path, b"hello", "text/plain")
    assert isinstance(obj, StoredObject)
    assert obj.public_url
    adapter.delete(path)
