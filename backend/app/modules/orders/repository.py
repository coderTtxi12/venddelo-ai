from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.core.pagination import CursorPage, PaginationParams
from app.modules.orders.schemas import OrderCreate, OrderDTO


class OrderRepository(ABC):
    @abstractmethod
    def add(self, data: OrderCreate) -> OrderDTO: ...

    @abstractmethod
    def get(self, id: uuid.UUID) -> OrderDTO | None: ...

    @abstractmethod
    def list_by_restaurant(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        status: str | None = None,
    ) -> CursorPage[OrderDTO]: ...

    @abstractmethod
    def update_status(self, id: uuid.UUID, status: str) -> OrderDTO | None: ...

    @abstractmethod
    def get_by_idempotency_key(self, restaurant_id: uuid.UUID, key: str) -> OrderDTO | None: ...
