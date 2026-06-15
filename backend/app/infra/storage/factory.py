from __future__ import annotations

from app.core.config import Settings, get_settings
from app.core.storage import StoragePort
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.infra.storage.supabase_storage import SupabaseStorageAdapter


def build_storage(settings: Settings | None = None) -> StoragePort:
    cfg = settings or get_settings()
    if cfg.supabase_url and cfg.supabase_service_role_key:
        return SupabaseStorageAdapter(cfg)
    return MemoryStorageAdapter()
