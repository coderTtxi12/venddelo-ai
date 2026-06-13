import uuid

from app.modules.ai.adapters import SqlAlchemyAIArtifactRepository
from app.modules.ai.schemas import AIArtifactCreate
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


@requires_db
def test_add_and_list_for_entity(session):
    r = _restaurant(session, "ai1")
    repo = SqlAlchemyAIArtifactRepository(session)
    eid = uuid.uuid4()
    repo.add(
        AIArtifactCreate(
            restaurant_id=r.id,
            entity_type="product",
            entity_id=eid,
            field="description",
            original_value="a",
            optimized_value="b",
        )
    )
    rows = repo.list_for_entity(r.id, "product", eid)
    assert len(rows) == 1


@requires_db
def test_get_latest_and_mark_reverted(session):
    r = _restaurant(session, "ai2")
    repo = SqlAlchemyAIArtifactRepository(session)
    eid = uuid.uuid4()
    repo.add(
        AIArtifactCreate(
            restaurant_id=r.id,
            entity_type="product",
            entity_id=eid,
            field="name",
            optimized_value="v1",
        )
    )
    # commit so the second artifact gets a strictly later transaction timestamp
    session.commit()
    latest = repo.add(
        AIArtifactCreate(
            restaurant_id=r.id,
            entity_type="product",
            entity_id=eid,
            field="name",
            optimized_value="v2",
        )
    )
    got = repo.get_latest(r.id, "product", eid, "name")
    assert got.id == latest.id
    reverted = repo.mark_reverted(latest.id)
    assert reverted.status == "reverted"
