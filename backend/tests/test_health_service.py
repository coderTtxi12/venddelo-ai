from app.core.config import Settings
from app.modules.health.adapters import InMemoryHealthCheck
from app.modules.health.service import HealthService


def test_service_returns_ok_status():
    settings = Settings(app_env="staging", app_version="9.9.9")
    service = HealthService(InMemoryHealthCheck(settings))

    status = service.get_status()

    assert status.status == "ok"
    assert status.env == "staging"
    assert status.version == "9.9.9"
