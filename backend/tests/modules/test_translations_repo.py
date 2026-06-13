import uuid

from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from app.modules.translations.adapters import SqlAlchemyTranslationRepository
from app.modules.translations.schemas import TranslationUpsert
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


def _upsert(restaurant_id, entity_id, **kwargs) -> TranslationUpsert:
    base = dict(
        restaurant_id=restaurant_id,
        locale="en",
        entity_type="product",
        entity_id=entity_id,
        field="name",
        translated_text="Hello",
        source_hash="h1",
    )
    base.update(kwargs)
    return TranslationUpsert(**base)


@requires_db
def test_upsert_then_get(session):
    r = _restaurant(session, "tr1")
    repo = SqlAlchemyTranslationRepository(session)
    eid = uuid.uuid4()
    repo.upsert(_upsert(r.id, eid))
    got = repo.get(r.id, "en", "product", eid, "name")
    assert got is not None
    assert got.translated_text == "Hello"


@requires_db
def test_upsert_updates_not_duplicates(session):
    r = _restaurant(session, "tr2")
    repo = SqlAlchemyTranslationRepository(session)
    eid = uuid.uuid4()
    repo.upsert(_upsert(r.id, eid, translated_text="A", source_hash="h1"))
    repo.upsert(_upsert(r.id, eid, translated_text="B", source_hash="h2"))
    rows = repo.list_for_menu(r.id, "en")
    assert len(rows) == 1
    assert rows[0].translated_text == "B"
    assert rows[0].source_hash == "h2"


@requires_db
def test_delete_stale(session):
    r = _restaurant(session, "tr3")
    repo = SqlAlchemyTranslationRepository(session)
    eid = uuid.uuid4()
    repo.upsert(_upsert(r.id, eid, source_hash="old"))
    removed = repo.delete_stale(r.id, "product", eid, "name", "new")
    assert removed == 1
    assert repo.get(r.id, "en", "product", eid, "name") is None
