from __future__ import annotations

import uuid

from app.core.exceptions import NotFoundError
from app.core.pagination import PaginationParams
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
from app.modules.restaurants.repository import RestaurantRepository


class CustomerService:
    def __init__(
        self,
        customers: SqlAlchemyCustomerRepository,
        restaurants: RestaurantRepository,
    ) -> None:
        self._customers = customers
        self._restaurants = restaurants

    def list_for_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        query: str | None = None,
        source: CustomerSource | None = None,
        frequency: CustomerFrequency | None = None,
        spend: CustomerSpend | None = None,
        recency: CustomerRecency | None = None,
        sort: CustomerSort = "last_at",
        order: CustomerSortOrder | None = None,
        page: int = 1,
    ) -> RestaurantCustomerList:
        self._require_restaurant(restaurant_id)
        return self._customers.list_for_restaurant(
            restaurant_id,
            params,
            query=query,
            source=source,
            frequency=frequency,
            spend=spend,
            recency=recency,
            sort=sort,
            order=order,
            page=page,
        )

    def activity_for_phone(
        self,
        restaurant_id: uuid.UUID,
        phone_key: str,
        params: PaginationParams,
        *,
        sort: ActivityHistorySort = "date-desc",
    ) -> RestaurantCustomerActivity:
        self._require_restaurant(restaurant_id)
        activity = self._customers.activity_for_phone(
            restaurant_id,
            phone_key,
            params,
            sort=sort,
        )
        if activity is None:
            raise NotFoundError("Cliente no encontrado")
        return activity

    def _require_restaurant(self, restaurant_id: uuid.UUID) -> None:
        if self._restaurants.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
