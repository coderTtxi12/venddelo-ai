from abc import ABC, abstractmethod


class RateLimiterPort(ABC):
    @abstractmethod
    def is_allowed(self, key: str, *, limit: int, window_seconds: int) -> bool: ...

    @abstractmethod
    def remaining(self, key: str, *, limit: int, window_seconds: int) -> int: ...
