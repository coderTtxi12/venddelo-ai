from __future__ import annotations

from typing import Any

from supabase import Client, create_client

from app.core.config import Settings
from app.core.storage import StorageError, StoragePort, StoredObject


class SupabaseStorageAdapter(StoragePort):
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise StorageError("Supabase storage is not configured")
        self._bucket = settings.supabase_storage_bucket
        self._client: Client = create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )

    def _store(self) -> Any:
        return self._client.storage.from_(self._bucket)

    def upload(
        self, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> StoredObject:
        try:
            self._store().upload(
                path,
                data,
                {"content-type": content_type, "upsert": str(upsert).lower()},
            )
        except Exception as exc:
            raise StorageError(str(exc)) from exc
        return StoredObject(path=path, public_url=self.get_public_url(path))

    def delete(self, path: str) -> None:
        try:
            self._store().remove([path])
        except Exception as exc:
            raise StorageError(str(exc)) from exc

    def get_public_url(self, path: str) -> str:
        return str(self._store().get_public_url(path))

    def create_signed_url(self, path: str, expires_in: int) -> str:
        try:
            res = self._store().create_signed_url(path, expires_in)
        except Exception as exc:
            raise StorageError(str(exc)) from exc
        return str(res["signedURL"])
