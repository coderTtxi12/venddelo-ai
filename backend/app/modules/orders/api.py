import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.orders.schemas import OrderDTO, OrderStatusSummaryDTO, OrderStatusUpdate
from app.modules.orders.service import OrderService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["orders"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> OrderService:
    return OrderService(
        uow.orders,
        uow.restaurants,
        uow.menu,
        uow.idempotency,
        uow.promotions,
    )


@router.get(
    "/restaurants/{restaurant_id}/orders/summary",
    response_model=OrderStatusSummaryDTO,
)
def order_status_summary(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> OrderStatusSummaryDTO:
    return service.get_status_summary(restaurant.id)


@router.get(
    "/restaurants/{restaurant_id}/orders",
    response_model=CursorPage[OrderDTO],
)
def list_orders(
    params: PaginationParams = Depends(pagination_params),
    status: str | None = Query(default=None),
    view: str | None = Query(default=None),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> CursorPage[OrderDTO]:
    return service.list_for_restaurant(restaurant.id, params, status=status, view=view)


@router.get(
    "/restaurants/{restaurant_id}/orders/{order_id}",
    response_model=OrderDTO,
)
def get_order(
    order_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> OrderDTO:
    return service.get(restaurant.id, order_id)


@router.post(
    "/restaurants/{restaurant_id}/orders/{order_id}/status",
    response_model=OrderDTO,
)
def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> OrderDTO:
    return service.update_status(
        restaurant.id,
        order_id,
        body.status,
        body.cancellation_reason,
    )
