from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_commit_persists(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        uow.restaurants.add(RestaurantCreate(name="U", subdomain="uow1"))
        uow.commit()
    with SqlAlchemyUnitOfWork(factory) as uow:
        assert uow.restaurants.get_by_subdomain("uow1") is not None


@requires_db
def test_rollback_on_exception(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with SqlAlchemyUnitOfWork(factory) as uow:
            uow.restaurants.add(RestaurantCreate(name="U", subdomain="uow2"))
            raise RuntimeError("boom")
    except RuntimeError:
        pass
    with SqlAlchemyUnitOfWork(factory) as uow:
        assert uow.restaurants.get_by_subdomain("uow2") is None
