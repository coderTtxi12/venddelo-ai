import uuid

from app.core.pagination import PaginationParams
from app.db.models.restaurant import RestaurantMember
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
    repo.update(
        dto.id,
        RestaurantUpdate(
            name="R2",
            description="Tacos al pastor desde 1985",
            latitude=19.318899,
            longitude=-98.236788,
            address="Centro, Tlaxcala",
        ),
    )
    updated = repo.get(dto.id)
    assert updated.name == "R2"
    assert updated.description == "Tacos al pastor desde 1985"
    assert updated.latitude == 19.318899
    assert updated.longitude == -98.236788
    assert updated.address == "Centro, Tlaxcala"
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
    schedules = repo.list_schedules(dto.id)
    assert len(schedules) == 1
    assert schedules[0].service_type == "takeout"
    repo.set_payment_methods(
        dto.id,
        [PaymentMethodCreate(method="cash", service_type="takeout")],
    )
    # replace (delete-then-insert) should keep a single row each
    repo.set_payment_methods(
        dto.id,
        [PaymentMethodCreate(method="transfer", service_type="delivery")],
    )
    methods = repo.list_payment_methods(dto.id)
    assert len(methods) == 1
    assert methods[0].method == "transfer"


@requires_db
def test_get_for_user_prefers_owner_id_over_stale_membership(session):
    owner_id = uuid.uuid4()
    repo = SqlAlchemyRestaurantRepository(session)

    primary = repo.add(
        RestaurantCreate(name="Primary", subdomain="primary-rest"),
        owner_id=owner_id,
    )
    session.query(RestaurantMember).filter_by(restaurant_id=primary.id).delete()
    session.flush()

    draft = repo.add(
        RestaurantCreate(name="Draft", subdomain="draft-rest"),
        owner_id=uuid.uuid4(),
    )
    session.add(
        RestaurantMember(
            restaurant_id=draft.id,
            user_id=owner_id,
            member_role="owner",
            is_active=True,
        )
    )
    session.flush()

    found = repo.get_for_user(owner_id)
    assert found is not None
    restaurant, role = found
    assert restaurant.id == primary.id
    assert role == "owner"


@requires_db
def test_get_for_user_falls_back_to_membership_for_admin(session):
    owner_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    repo = SqlAlchemyRestaurantRepository(session)

    invited = repo.add(
        RestaurantCreate(name="Invited", subdomain="invited-rest"),
        owner_id=owner_id,
    )
    repo.add_admin_invite(invited.id, "admin@empresa.com")
    repo.claim_admin_invites(admin_id, "admin@empresa.com")

    found = repo.get_for_user(admin_id)
    assert found is not None
    restaurant, role = found
    assert restaurant.id == invited.id
    assert role == "admin"


@requires_db
def test_get_for_user_falls_back_to_legacy_owner_id(session):
    owner_id = uuid.uuid4()
    repo = SqlAlchemyRestaurantRepository(session)
    created = repo.add(
        RestaurantCreate(name="Legacy", subdomain="legacy-owner"),
        owner_id=owner_id,
    )
    session.query(RestaurantMember).filter_by(restaurant_id=created.id).delete()
    session.flush()

    found = repo.get_for_user(owner_id)
    assert found is not None
    restaurant, role = found
    assert restaurant.id == created.id
    assert restaurant.subdomain == "legacy-owner"
    assert role == "owner"
