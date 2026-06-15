from __future__ import annotations

import re
import uuid

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
)

_SUBDOMAIN_RE = re.compile(r"^[a-z0-9](-?[a-z0-9])*$")


def _validate_subdomain(subdomain: str) -> None:
    if len(subdomain) < 3 or len(subdomain) > 63:
        raise ValidationError("Subdomain must be 3-63 characters")
    if not _SUBDOMAIN_RE.match(subdomain):
        raise ValidationError("Invalid subdomain format")


class RestaurantService:
    def __init__(self, repo: RestaurantRepository) -> None:
        self._repo = repo

    def create(self, owner_id: uuid.UUID, data: RestaurantCreate) -> RestaurantDTO:
        _validate_subdomain(data.subdomain)
        if self._repo.get_by_subdomain(data.subdomain):
            raise ConflictError("Subdomain already taken")
        return self._repo.add(data, owner_id=owner_id)

    def get(self, restaurant_id: uuid.UUID) -> RestaurantDTO:
        dto = self._repo.get(restaurant_id)
        if dto is None:
            raise NotFoundError("Restaurant not found")
        return dto

    def list_for_owner(
        self, owner_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[RestaurantDTO]:
        return self._repo.list_for_owner(owner_id, params)

    def update(self, restaurant_id: uuid.UUID, data: RestaurantUpdate) -> RestaurantDTO:
        dto = self._repo.update(restaurant_id, data)
        if dto is None:
            raise NotFoundError("Restaurant not found")
        return dto

    def delete(self, restaurant_id: uuid.UUID) -> None:
        if not self._repo.soft_delete(restaurant_id):
            raise NotFoundError("Restaurant not found")

    def set_schedules(self, restaurant_id: uuid.UUID, schedules: list[ScheduleCreate]) -> None:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        self._repo.set_schedules(restaurant_id, schedules)

    def set_payment_methods(
        self, restaurant_id: uuid.UUID, methods: list[PaymentMethodCreate]
    ) -> None:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        self._repo.set_payment_methods(restaurant_id, methods)
