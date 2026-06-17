from __future__ import annotations

import re
import uuid

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    PaymentMethodDTO,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
    ScheduleDTO,
)

_SUBDOMAIN_RE = re.compile(r"^[a-z0-9](-?[a-z0-9])*$")
_THEME_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DEFAULT_DIGITAL_MENU_THEME_ID = "original"


def _validate_subdomain(subdomain: str) -> None:
    if len(subdomain) < 3 or len(subdomain) > 63:
        raise ValidationError("Subdomain must be 3-63 characters")
    if not _SUBDOMAIN_RE.match(subdomain):
        raise ValidationError("Invalid subdomain format")


def _validate_digital_menu_theme_id(theme_id: str) -> None:
    if len(theme_id) < 1 or len(theme_id) > 64:
        raise ValidationError("digital_menu_theme_id must be 1-64 characters")
    if not _THEME_ID_RE.match(theme_id):
        raise ValidationError("Invalid digital_menu_theme_id format")


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
        if data.digital_menu_theme_id is not None:
            _validate_digital_menu_theme_id(data.digital_menu_theme_id)
        if data.subdomain is not None:
            subdomain = data.subdomain.lower().strip()
            _validate_subdomain(subdomain)
            existing = self._repo.get_by_subdomain(subdomain)
            if existing is not None and existing.id != restaurant_id:
                raise ConflictError("Subdomain already taken")
            data = data.model_copy(update={"subdomain": subdomain})
        dto = self._repo.update(restaurant_id, data)
        if dto is None:
            raise NotFoundError("Restaurant not found")
        return dto

    def check_subdomain_availability(
        self,
        subdomain: str,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> tuple[str, bool, bool, str | None]:
        """Returns (normalized, available, valid_format, message)."""
        normalized = subdomain.lower().strip()
        try:
            _validate_subdomain(normalized)
        except ValidationError as exc:
            return normalized, False, False, str(exc)
        existing = self._repo.get_by_subdomain(normalized)
        if existing is not None and (exclude_id is None or existing.id != exclude_id):
            return normalized, False, True, "Subdomain already taken"
        return normalized, True, True, None

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

    def list_schedules(self, restaurant_id: uuid.UUID) -> list[ScheduleDTO]:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        return list(self._repo.list_schedules(restaurant_id))

    def list_payment_methods(self, restaurant_id: uuid.UUID) -> list[PaymentMethodDTO]:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        return list(self._repo.list_payment_methods(restaurant_id))
