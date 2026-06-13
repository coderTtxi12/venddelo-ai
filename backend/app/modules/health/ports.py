from abc import ABC, abstractmethod

from app.modules.health.schemas import HealthStatus


class HealthCheckPort(ABC):
    @abstractmethod
    def check(self) -> HealthStatus: ...
