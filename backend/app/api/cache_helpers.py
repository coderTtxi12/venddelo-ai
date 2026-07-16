import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.cache.menu_cache import MenuCacheService
from app.infra.realtime.digital_menu_hub import get_digital_menu_realtime_hub
from app.infra.redis.factory import build_cache
from app.modules.menu.service import MenuService


def notify_digital_menu_preview_changed(restaurant_id: uuid.UUID) -> None:
    get_digital_menu_realtime_hub().publish_sync(
        restaurant_id,
        {"type": "digital_menu.changed"},
    )


def invalidate_restaurant_menu_cache(uow: SqlAlchemyUnitOfWork, restaurant_id: uuid.UUID) -> None:
    MenuCacheService(
        build_cache(),
        uow.restaurants,
        MenuService(uow.menu),
    ).invalidate_restaurant(restaurant_id)
    notify_digital_menu_preview_changed(restaurant_id)
