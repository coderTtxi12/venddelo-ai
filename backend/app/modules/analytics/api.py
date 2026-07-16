from fastapi import APIRouter, Depends, Query

from app.api.deps import require_owned_restaurant
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.analytics.schemas import AnalyticsDashboard, AnalyticsGranularity
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
    granularity: AnalyticsGranularity = Query(default="monthly"),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AnalyticsService = Depends(_service),
) -> AnalyticsDashboard:
    return service.get_dashboard(restaurant.id, granularity=granularity)
