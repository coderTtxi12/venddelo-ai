from abc import ABC, abstractmethod


class CachePort(ABC):
    @abstractmethod
    def get(self, key: str) -> str | None: ...

    @abstractmethod
    def set(self, key: str, value: str, ttl_seconds: int) -> None: ...

    @abstractmethod
    def set_nx(self, key: str, value: str, ttl_seconds: int) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def delete_pattern(self, pattern: str) -> int: ...
