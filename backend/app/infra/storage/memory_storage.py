from __future__ import annotations

from app.core.storage import StorageError, StoragePort, StoredObject


class MemoryStorageAdapter(StoragePort):
    """In-memory storage for tests and local dev without Supabase."""

    def __init__(self) -> None:
        self._objects: dict[str, tuple[bytes, str]] = {}

    def upload(
        self, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> StoredObject:
        if not upsert and path in self._objects:
            raise StorageError("Object already exists")
        self._objects[path] = (data, content_type)
        return StoredObject(path=path, public_url=f"memory://{path}")

    def delete(self, path: str) -> None:
        self._objects.pop(path, None)

    def get_public_url(self, path: str) -> str:
        if path not in self._objects:
            raise StorageError("Object not found")
        return f"memory://{path}"

    def create_signed_url(self, path: str, expires_in: int) -> str:
        return self.get_public_url(path)

    def read(self, path: str) -> bytes:
        obj = self._objects.get(path)
        if obj is None:
            raise StorageError("Object not found")
        return obj[0]
