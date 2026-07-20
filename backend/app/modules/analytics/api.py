from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_owned_restaurant
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.analytics.schemas import (
    AnalyticsDashboard,
    AnalyticsGranularity,
    AnalyticsPreset,
)
from app.modules.analytics.service import AnalyticsService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["analytics"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> AnalyticsService:
    return AnalyticsService(uow.analytics, uow.restaurants)


@router.get(
    "/restaurants/{restaurant_id}/analytics",
    response_model=AnalyticsDashboard,
)
def get_restaurant_analytics(
    preset: AnalyticsPreset | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    granularity: AnalyticsGranularity | None = Query(default=None),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AnalyticsService = Depends(_service),
) -> AnalyticsDashboard:
    effective_preset: AnalyticsPreset = preset or "12m"
    return service.get_dashboard(
        restaurant.id,
        preset=effective_preset,
        start_date=start.isoformat() if start else None,
        end_date=end.isoformat() if end else None,
        granularity=granularity,
    )
