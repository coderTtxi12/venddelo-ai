from app.modules.health.ports import HealthCheckPort
from app.modules.health.schemas import HealthStatus


class HealthService:
    def __init__(self, health_check: HealthCheckPort) -> None:
        self._health_check = health_check

    def get_status(self) -> HealthStatus:
        return self._health_check.check()
