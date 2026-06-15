from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    PaymentMethodDTO,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
)


class RestaurantRepository(ABC):
    @abstractmethod
    def add(
        self, data: RestaurantCreate, *, owner_id: uuid.UUID | None = None
    ) -> RestaurantDTO: ...

    @abstractmethod
    def get(self, id: uuid.UUID) -> RestaurantDTO | None: ...

    @abstractmethod
    def get_by_subdomain(self, subdomain: str) -> RestaurantDTO | None: ...

    @abstractmethod
    def list(self, params: PaginationParams) -> CursorPage[RestaurantDTO]: ...

    @abstractmethod
    def list_for_owner(
        self, owner_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[RestaurantDTO]: ...

    @abstractmethod
    def list_payment_methods(self, restaurant_id: uuid.UUID) -> Sequence[PaymentMethodDTO]: ...

    @abstractmethod
    def update(self, id: uuid.UUID, data: RestaurantUpdate) -> RestaurantDTO | None: ...

    @abstractmethod
    def soft_delete(self, id: uuid.UUID) -> bool: ...

    @abstractmethod
    def set_schedules(self, id: uuid.UUID, schedules: Sequence[ScheduleCreate]) -> None: ...

    @abstractmethod
    def set_payment_methods(
        self, id: uuid.UUID, methods: Sequence[PaymentMethodCreate]
    ) -> None: ...
