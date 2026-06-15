from __future__ import annotations

from app.core.cache import CachePort
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.palettes import normalize_locale
from app.infra.cache.menu_cache import MenuCacheService, menu_cache_key
from app.modules.menu.schemas import FullMenuDTO
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.translations.service import TranslationService


class TranslatedMenuService:
    def __init__(
        self,
        cache: CachePort,
        restaurants: RestaurantRepository,
        menu_cache: MenuCacheService,
        translation: TranslationService,
        *,
        ttl_seconds: int | None = None,
    ) -> None:
        self._cache = cache
        self._restaurants = restaurants
        self._menu_cache = menu_cache
        self._translation = translation
        self._ttl = ttl_seconds or get_settings().translation_cache_ttl_seconds

    def get_public_menu(self, subdomain: str, locale: str = "default") -> FullMenuDTO:
        restaurant = self._restaurants.get_by_subdomain(subdomain)
        if restaurant is None or restaurant.status != "published":
            raise NotFoundError("Restaurant not found")

        original = normalize_locale(restaurant.original_language)
        effective_locale = original if locale in {"default", ""} else normalize_locale(locale)

        if effective_locale == original:
            return self._menu_cache.get_public_menu(subdomain, "default")

        key = menu_cache_key(subdomain, effective_locale)
        cached = self._cache.get(key)
        if cached is not None:
            return FullMenuDTO.model_validate_json(cached)

        base = self._menu_cache.get_public_menu(subdomain, "default")
        translated = self._translation.translate_menu(base, restaurant, effective_locale)
        self._cache.set(key, translated.model_dump_json(), self._ttl)
        return translated
