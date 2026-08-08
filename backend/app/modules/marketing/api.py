import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.api.deps import require_owned_restaurant
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.marketing.schemas import (
    FacebookPostCreate,
    MarketingTaskQueuedResponse,
    MarketingTaskStatusResponse,
)
from app.modules.marketing.service import MarketingService
from app.modules.marketing.worker import run_marketing_facebook_post_task
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["marketing"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> MarketingService:
    return MarketingService(uow.marketing)


@router.post(
    "/restaurants/{restaurant_id}/marketing/facebook/posts",
    response_model=MarketingTaskQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_facebook_post(
    data: FacebookPostCreate,
    background_tasks: BackgroundTasks,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MarketingService = Depends(_service),
) -> MarketingTaskQueuedResponse:
    queued = service.enqueue_facebook_post(restaurant.id, data.message)
    background_tasks.add_task(run_marketing_facebook_post_task, queued.task_id)
    return queued


@router.get(
    "/restaurants/{restaurant_id}/marketing/tasks/{task_id}",
    response_model=MarketingTaskStatusResponse,
)
def get_marketing_task(
    task_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MarketingService = Depends(_service),
) -> MarketingTaskStatusResponse:
    return service.get_task(restaurant.id, task_id)
