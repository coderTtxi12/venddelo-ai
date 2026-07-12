from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    PaymentMethodDTO,
    RestaurantAdminInviteCreate,
    RestaurantAdminInviteDTO,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantAccessItem,
    RestaurantMemberDTO,
    RestaurantUpdate,
    ScheduleCreate,
    ScheduleDTO,
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
    def list_schedules(self, restaurant_id: uuid.UUID) -> Sequence[ScheduleDTO]: ...

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

    @abstractmethod
    def get_for_user(
        self,
        user_id: uuid.UUID,
        *,
        restaurant_id: uuid.UUID | None = None,
    ) -> tuple[RestaurantDTO, str] | None: ...

    @abstractmethod
    def list_accessible(self, user_id: uuid.UUID) -> Sequence[RestaurantAccessItem]: ...

    @abstractmethod
    def touch_last_accessed(self, user_id: uuid.UUID, restaurant_id: uuid.UUID) -> None: ...

    @abstractmethod
    def remove_admin_member(self, restaurant_id: uuid.UUID, member_id: uuid.UUID) -> None: ...

    @abstractmethod
    def user_has_membership(self, user_id: uuid.UUID) -> bool: ...

    @abstractmethod
    def email_associated_with_other_restaurant(
        self,
        email: str,
        *,
        exclude_restaurant_id: uuid.UUID | None = None,
    ) -> bool: ...

    @abstractmethod
    def list_admin_invites(
        self, restaurant_id: uuid.UUID
    ) -> Sequence[RestaurantAdminInviteDTO]: ...

    @abstractmethod
    def add_admin_invite(
        self, restaurant_id: uuid.UUID, email: str
    ) -> RestaurantAdminInviteDTO: ...

    @abstractmethod
    def remove_admin_invite(self, restaurant_id: uuid.UUID, invite_id: uuid.UUID) -> None: ...

    @abstractmethod
    def list_admin_members(
        self, restaurant_id: uuid.UUID
    ) -> Sequence[RestaurantMemberDTO]: ...

    @abstractmethod
    def claim_admin_invites(self, user_id: uuid.UUID, email: str) -> bool: ...
