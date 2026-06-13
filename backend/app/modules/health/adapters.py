from app.core.config import Settings
from app.modules.health.ports import HealthCheckPort
from app.modules.health.schemas import HealthStatus


class InMemoryHealthCheck(HealthCheckPort):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def check(self) -> HealthStatus:
        return HealthStatus(
            status="ok",
            env=self._settings.app_env,
            version=self._settings.app_version,
        )
