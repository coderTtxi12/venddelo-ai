from fastapi import APIRouter, Depends, Query

from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.customers.adapters import SqlAlchemyCustomerRepository
from app.modules.customers.schemas import (
    ActivityHistorySort,
    CustomerFrequency,
    CustomerRecency,
    CustomerSort,
    CustomerSortOrder,
    CustomerSource,
    CustomerSpend,
    RestaurantCustomerActivity,
    RestaurantCustomerList,
)
from app.modules.customers.service import CustomerService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["customers"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> CustomerService:
    return CustomerService(SqlAlchemyCustomerRepository(uow.session), uow.restaurants)


@router.get(
    "/restaurants/{restaurant_id}/customers",
    response_model=RestaurantCustomerList,
)
def list_restaurant_customers(
    params: PaginationParams = Depends(pagination_params),
    page: int = Query(default=1, ge=1),
    q: str | None = Query(default=None),
    source: CustomerSource | None = Query(default=None),
    frequency: CustomerFrequency | None = Query(default=None),
    spend: CustomerSpend | None = Query(default=None),
    recency: CustomerRecency | None = Query(default=None),
    sort: CustomerSort = Query(default="last_at"),
    order: CustomerSortOrder | None = Query(default=None),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: CustomerService = Depends(_service),
) -> RestaurantCustomerList:
    return service.list_for_restaurant(
        restaurant.id,
        params,
        query=q,
        source=source,
        frequency=frequency,
        spend=spend,
        recency=recency,
        sort=sort,
        order=order,
        page=page,
    )


@router.get(
    "/restaurants/{restaurant_id}/customers/{phone_key}/activity",
    response_model=RestaurantCustomerActivity,
)
def get_restaurant_customer_activity(
    phone_key: str,
    params: PaginationParams = Depends(pagination_params),
    sort: ActivityHistorySort = Query(default="date-desc"),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: CustomerService = Depends(_service),
) -> RestaurantCustomerActivity:
    return service.activity_for_phone(restaurant.id, phone_key, params, sort=sort)
