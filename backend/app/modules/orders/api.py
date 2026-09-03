import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.coupons.service import CouponService
from app.modules.orders.schemas import (
    KitchenBoardClearResult,
    OrderBulkStatusResult,
    OrderBulkStatusUpdate,
    OrderDTO,
    OrderStatusSummaryDTO,
    OrderStatusUpdate,
)
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
        CouponService(uow.coupons),
        inventory_changed=lambda restaurant_id: invalidate_restaurant_menu_cache(
            uow, restaurant_id
        ),
    )


@router.get(
    "/restaurants/{restaurant_id}/orders/summary",
    response_model=OrderStatusSummaryDTO,
)
def order_status_summary(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
    board: str = Query(default="kitchen"),
) -> OrderStatusSummaryDTO:
    return service.get_status_summary(restaurant.id, board=board)


@router.get(
    "/restaurants/{restaurant_id}/orders",
    response_model=CursorPage[OrderDTO],
)
def list_orders(
    params: PaginationParams = Depends(pagination_params),
    status: str | None = Query(default=None),
    view: str | None = Query(default=None),
    board: str = Query(default="kitchen"),
    q: str | None = Query(default=None),
    order_type: str | None = Query(default=None, alias="type"),
    payment_method: str | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    sort: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> CursorPage[OrderDTO]:
    return service.list_for_restaurant(
        restaurant.id,
        params,
        status=status,
        view=view,
        board=board,
        q=q,
        order_type=order_type,
        payment_method=payment_method,
        from_date=from_date,
        to_date=to_date,
        sort=sort,
        order=order,
    )


@router.post(
    "/restaurants/{restaurant_id}/orders/bulk-status",
    response_model=OrderBulkStatusResult,
)
def update_orders_status_bulk(
    body: OrderBulkStatusUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> OrderBulkStatusResult:
    return service.update_status_bulk(
        restaurant.id,
        body.order_ids,
        body.status,
        body.cancellation_reason,
    )


@router.post(
    "/restaurants/{restaurant_id}/orders/kds-clear",
    response_model=KitchenBoardClearResult,
)
def clear_kitchen_closed_orders(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: OrderService = Depends(_service),
) -> KitchenBoardClearResult:
    return KitchenBoardClearResult(cleared_count=service.clear_closed_from_kds(restaurant.id))


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
