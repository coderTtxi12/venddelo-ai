import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.cache.menu_cache import MenuCacheService
from app.infra.redis.factory import build_cache
from app.modules.menu.service import MenuService


def invalidate_restaurant_menu_cache(uow: SqlAlchemyUnitOfWork, restaurant_id: uuid.UUID) -> None:
    MenuCacheService(
        build_cache(),
        uow.restaurants,
        MenuService(uow.menu),
    ).invalidate_restaurant(restaurant_id)
