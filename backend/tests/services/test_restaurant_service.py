import uuid
from datetime import UTC, datetime

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate, RestaurantDTO
from app.modules.restaurants.service import RestaurantService

OWNER = uuid.uuid4()


class FakeRestaurantRepo(RestaurantRepository):
    def __init__(self) -> None:
        self.items: dict[uuid.UUID, RestaurantDTO] = {}
        self.by_subdomain: dict[str, RestaurantDTO] = {}

    def add(self, data: RestaurantCreate, *, owner_id: uuid.UUID | None = None) -> RestaurantDTO:
        rid = uuid.uuid4()
        now = datetime.now(UTC)
        dto = RestaurantDTO(
            id=rid,
            name=data.name,
            subdomain=data.subdomain,
            original_language=data.original_language,
            status=data.status,
            owner_id=owner_id,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.items[rid] = dto
        self.by_subdomain[data.subdomain] = dto
        return dto

    def get(self, id: uuid.UUID) -> RestaurantDTO | None:
        return self.items.get(id)

    def get_by_subdomain(self, subdomain: str) -> RestaurantDTO | None:
        return self.by_subdomain.get(subdomain)

    def list(self, params: PaginationParams) -> CursorPage[RestaurantDTO]:
        return CursorPage(items=list(self.items.values()))

    def list_for_owner(
        self, owner_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[RestaurantDTO]:
        items = [r for r in self.items.values() if r.owner_id == owner_id]
        return CursorPage(items=items)

    def list_payment_methods(self, restaurant_id: uuid.UUID):
        return []

    def update(self, id, data):
        return self.items.get(id)

    def soft_delete(self, id: uuid.UUID) -> bool:
        return id in self.items

    def set_schedules(self, id, schedules) -> None:
        pass

    def set_payment_methods(self, id, methods) -> None:
        pass


def test_create_validates_subdomain():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    with pytest.raises(ValidationError):
        svc.create(OWNER, RestaurantCreate(name="R", subdomain="AB"))


def test_create_rejects_duplicate_subdomain():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    svc.create(OWNER, RestaurantCreate(name="R", subdomain="tacos"))
    with pytest.raises(ConflictError):
        svc.create(OWNER, RestaurantCreate(name="R2", subdomain="tacos"))
