from app.core.pagination import PaginationParams
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
    RestaurantUpdate,
    ScheduleCreate,
)
from tests.conftest import requires_db


@requires_db
def test_add_and_get(session):
    repo = SqlAlchemyRestaurantRepository(session)
    dto = repo.add(RestaurantCreate(name="R", subdomain="r1"))
    assert repo.get(dto.id).subdomain == "r1"


@requires_db
def test_get_by_subdomain(session):
    repo = SqlAlchemyRestaurantRepository(session)
    repo.add(RestaurantCreate(name="R", subdomain="sub1"))
    assert repo.get_by_subdomain("sub1") is not None
    assert repo.get_by_subdomain("missing") is None


@requires_db
def test_update_and_soft_delete(session):
    repo = SqlAlchemyRestaurantRepository(session)
    dto = repo.add(RestaurantCreate(name="R", subdomain="sub2"))
    repo.update(dto.id, RestaurantUpdate(name="R2"))
    assert repo.get(dto.id).name == "R2"
    assert repo.soft_delete(dto.id) is True
    assert repo.get(dto.id) is None


@requires_db
def test_list_pagination(session):
    repo = SqlAlchemyRestaurantRepository(session)
    for i in range(3):
        repo.add(RestaurantCreate(name=f"R{i}", subdomain=f"p{i}"))
    page = repo.list(PaginationParams(limit=2))
    assert len(page.items) == 2
    assert page.next_cursor is not None
    page2 = repo.list(PaginationParams(limit=2, cursor=page.next_cursor))
    assert len(page2.items) >= 1


@requires_db
def test_set_schedules_and_payment_methods(session):
    repo = SqlAlchemyRestaurantRepository(session)
    dto = repo.add(RestaurantCreate(name="R", subdomain="cfg"))
    repo.set_schedules(
        dto.id,
        [
            ScheduleCreate(
                service_type="takeout",
                day_of_week=0,
                opens_at="08:00",
                closes_at="14:00",
            )
        ],
    )
    repo.set_payment_methods(
        dto.id,
        [PaymentMethodCreate(method="cash", service_type="takeout")],
    )
    # replace (delete-then-insert) should keep a single row each
    repo.set_payment_methods(
        dto.id,
        [PaymentMethodCreate(method="transfer", service_type="delivery")],
    )
