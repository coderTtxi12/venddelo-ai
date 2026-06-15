from fastapi import APIRouter, Depends, status

from app.api.deps import (
    get_synced_user,
    pagination_params,
    require_owned_restaurant,
)
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
)
from app.modules.restaurants.service import RestaurantService
from app.modules.users.schemas import UserDTO

router = APIRouter(prefix="/restaurants", tags=["restaurants"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> RestaurantService:
    return RestaurantService(uow.restaurants)


@router.post("", response_model=RestaurantDTO, status_code=status.HTTP_201_CREATED)
def create_restaurant(
    data: RestaurantCreate,
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> RestaurantDTO:
    return service.create(user.id, data)


@router.get("", response_model=CursorPage[RestaurantDTO])
def list_my_restaurants(
    params: PaginationParams = Depends(pagination_params),
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> CursorPage[RestaurantDTO]:
    return service.list_for_owner(user.id, params)


@router.get("/{restaurant_id}", response_model=RestaurantDTO)
def get_restaurant(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
) -> RestaurantDTO:
    return restaurant


@router.patch("/{restaurant_id}", response_model=RestaurantDTO)
def update_restaurant(
    data: RestaurantUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> RestaurantDTO:
    return service.update(restaurant.id, data)


@router.delete("/{restaurant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_restaurant(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> None:
    service.delete(restaurant.id)


@router.put("/{restaurant_id}/schedules", status_code=status.HTTP_204_NO_CONTENT)
def set_schedules(
    schedules: list[ScheduleCreate],
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> None:
    service.set_schedules(restaurant.id, schedules)


@router.put("/{restaurant_id}/payment-methods", status_code=status.HTTP_204_NO_CONTENT)
def set_payment_methods(
    methods: list[PaymentMethodCreate],
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> None:
    service.set_payment_methods(restaurant.id, methods)
