import uuid
from datetime import UTC, datetime

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate, RestaurantDTO, RestaurantUpdate
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

    def list_schedules(self, restaurant_id: uuid.UUID):
        return []

    def list_payment_methods(self, restaurant_id: uuid.UUID):
        return []

    def update(self, id, data):
        dto = self.items.get(id)
        if dto is None:
            return None
        updates = data.model_dump(exclude_unset=True)
        if "subdomain" in updates and updates["subdomain"] != dto.subdomain:
            del self.by_subdomain[dto.subdomain]
            self.by_subdomain[updates["subdomain"]] = dto
        updated = dto.model_copy(update=updates)
        self.items[id] = updated
        if "subdomain" in updates:
            self.by_subdomain[updates["subdomain"]] = updated
        return updated

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


def test_update_validates_digital_menu_theme_id():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    created = svc.create(OWNER, RestaurantCreate(name="R", subdomain="my-rest"))
    with pytest.raises(ValidationError):
        svc.update(created.id, RestaurantUpdate(digital_menu_theme_id="Invalid Theme!"))


def test_update_validates_subdomain_format():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    created = svc.create(OWNER, RestaurantCreate(name="R", subdomain="my-rest"))
    with pytest.raises(ValidationError):
        svc.update(created.id, RestaurantUpdate(subdomain="AB"))


def test_update_rejects_duplicate_subdomain():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    first = svc.create(OWNER, RestaurantCreate(name="R1", subdomain="tacos"))
    second = svc.create(OWNER, RestaurantCreate(name="R2", subdomain="burgers"))
    with pytest.raises(ConflictError):
        svc.update(second.id, RestaurantUpdate(subdomain="tacos"))


def test_update_allows_keeping_same_subdomain():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    created = svc.create(OWNER, RestaurantCreate(name="R", subdomain="my-rest"))
    updated = svc.update(created.id, RestaurantUpdate(subdomain="my-rest", name="Renamed"))
    assert updated.name == "Renamed"
    assert updated.subdomain == "my-rest"


def test_check_subdomain_availability():
    repo = FakeRestaurantRepo()
    svc = RestaurantService(repo)
    created = svc.create(OWNER, RestaurantCreate(name="R", subdomain="taken"))
    normalized, available, valid, message = svc.check_subdomain_availability("taken")
    assert normalized == "taken"
    assert available is False
    assert valid is True
    assert message == "Subdomain already taken"
    normalized, available, valid, message = svc.check_subdomain_availability(
        "taken",
        exclude_id=created.id,
    )
    assert available is True
    normalized, available, valid, message = svc.check_subdomain_availability("ab")
    assert available is False
    assert valid is False
