from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.modules.health.adapters import InMemoryHealthCheck
from app.modules.health.schemas import HealthStatus
from app.modules.health.service import HealthService

router = APIRouter(tags=["health"])


def get_health_service(settings: Settings = Depends(get_settings)) -> HealthService:
    return HealthService(InMemoryHealthCheck(settings))


@router.get("/health", response_model=HealthStatus)
def health(service: HealthService = Depends(get_health_service)) -> HealthStatus:
    return service.get_status()
