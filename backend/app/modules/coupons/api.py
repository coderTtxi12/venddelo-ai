import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.coupons.schemas import CouponCreate, CouponDTO, CouponUpdate
from app.modules.coupons.service import CouponService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["coupons"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> CouponService:
    return CouponService(uow.coupons)


@router.post(
    "/restaurants/{restaurant_id}/coupons",
    response_model=CouponDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_coupon(
    data: CouponCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: CouponService = Depends(_service),
) -> CouponDTO:
    return service.create(restaurant.id, data, timezone=restaurant.timezone)


@router.get(
    "/restaurants/{restaurant_id}/coupons",
    response_model=CursorPage[CouponDTO],
)
def list_coupons(
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: CouponService = Depends(_service),
) -> CursorPage[CouponDTO]:
    return service.list(restaurant.id, params, timezone=restaurant.timezone)


@router.patch(
    "/restaurants/{restaurant_id}/coupons/{coupon_id}",
    response_model=CouponDTO,
)
def update_coupon(
    coupon_id: uuid.UUID,
    data: CouponUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: CouponService = Depends(_service),
) -> CouponDTO:
    return service.update(restaurant.id, coupon_id, data, timezone=restaurant.timezone)


@router.delete(
    "/restaurants/{restaurant_id}/coupons/{coupon_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_coupon(
    coupon_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: CouponService = Depends(_service),
) -> None:
    service.soft_delete(restaurant.id, coupon_id)
