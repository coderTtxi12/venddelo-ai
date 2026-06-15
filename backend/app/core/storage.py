from abc import ABC, abstractmethod

from pydantic import BaseModel


class StoredObject(BaseModel):
    path: str
    public_url: str


class StorageError(Exception):
    """Uniform error type wrapping provider-specific storage failures."""


class StoragePort(ABC):
    @abstractmethod
    def upload(
        self, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> StoredObject: ...

    @abstractmethod
    def delete(self, path: str) -> None: ...

    @abstractmethod
    def get_public_url(self, path: str) -> str: ...

    @abstractmethod
    def create_signed_url(self, path: str, expires_in: int) -> str: ...

    @abstractmethod
    def read(self, path: str) -> bytes: ...
