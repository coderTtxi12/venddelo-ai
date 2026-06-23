from __future__ import annotations

import logging
import uuid

from app.core.cache import CachePort
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.modules.menu.schemas import FullMenuDTO
from app.modules.menu.service import MenuService
from app.modules.restaurants.repository import RestaurantRepository

logger = logging.getLogger(__name__)


def menu_cache_key(subdomain: str, locale: str) -> str:
    return f"menu:public:{subdomain}:{locale}"


class MenuCacheService:
    def __init__(
        self,
        cache: CachePort,
        restaurants: RestaurantRepository,
        menu: MenuService,
        *,
        ttl_seconds: int | None = None,
    ) -> None:
        self._cache = cache
        self._restaurants = restaurants
        self._menu = menu
        self._ttl = ttl_seconds or get_settings().menu_cache_ttl_seconds

    def get_public_menu(self, subdomain: str, locale: str = "default") -> FullMenuDTO:
        key = menu_cache_key(subdomain, locale)
        cached = self._cache.get(key)
        if cached is not None:
            logger.info("menu cache hit subdomain=%s locale=%s", subdomain, locale)
            return FullMenuDTO.model_validate_json(cached)

        logger.info("menu cache miss subdomain=%s locale=%s", subdomain, locale)
        restaurant = self._restaurants.get_by_subdomain(subdomain)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")

        menu = self._menu.get_full_menu(restaurant.id)
        self._cache.set(key, menu.model_dump_json(), self._ttl)
        logger.info(
            "menu cache populated subdomain=%s locale=%s ttl_seconds=%s",
            subdomain,
            locale,
            self._ttl,
        )
        return menu

    def invalidate_restaurant(self, restaurant_id: uuid.UUID) -> int:
        restaurant = self._restaurants.get(restaurant_id)
        if restaurant is None:
            return 0
        pattern = f"menu:public:{restaurant.subdomain}:*"
        removed = self._cache.delete_pattern(pattern)
        logger.info(
            "menu cache invalidated subdomain=%s removed=%s",
            restaurant.subdomain,
            removed,
        )
        return removed
