from __future__ import annotations

import logging
import uuid

from app.core.cache import CachePort
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.modules.menu.inventory import show_low_stock
from app.modules.menu.schemas import FullMenuDTO
from app.modules.menu.service import MenuService
from app.modules.restaurants.repository import RestaurantRepository

logger = logging.getLogger(__name__)


def sanitize_public_menu(
    menu: FullMenuDTO,
    *,
    live_menu_inventory_enabled: bool,
    low_stock_threshold: int,
) -> FullMenuDTO:
    products = []
    for product in menu.products:
        low_stock = (
            live_menu_inventory_enabled
            and product.status == "active"
            and (
                product.show_low_stock
                if product.inventory_qty is None
                else show_low_stock(
                    live_menu_inventory_enabled=live_menu_inventory_enabled,
                    inventory_qty=product.inventory_qty,
                    threshold=low_stock_threshold,
                    status=product.status,
                )
            )
        )
        # When live inventory is on, expose qty so the cart can block overselling.
        # When off, keep qty hidden (products without tracked stock stay null either way).
        public_qty = product.inventory_qty if live_menu_inventory_enabled else None
        products.append(
            product.model_copy(
                update={
                    "show_low_stock": low_stock,
                    "inventory_qty": public_qty,
                    "shelf_life_days": None,
                    "expires_on": None,
                    "batch_started_at": None,
                }
            )
        )
    return menu.model_copy(update={"products": products})


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
        restaurant = self._restaurants.get_by_subdomain(subdomain)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")
        return sanitize_public_menu(
            self.get_raw_menu(subdomain, locale),
            live_menu_inventory_enabled=restaurant.live_menu_inventory_enabled,
            low_stock_threshold=restaurant.low_stock_threshold,
        )

    def get_raw_menu(self, subdomain: str, locale: str = "default") -> FullMenuDTO:
        key = menu_cache_key(subdomain, locale)
        restaurant = self._restaurants.get_by_subdomain(subdomain)
        if restaurant is None:
            raise NotFoundError("Restaurant not found")

        cached = self._cache.get(key)
        if cached is not None:
            logger.info("menu cache hit subdomain=%s locale=%s", subdomain, locale)
            return FullMenuDTO.model_validate_json(cached)

        logger.info("menu cache miss subdomain=%s locale=%s", subdomain, locale)
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
