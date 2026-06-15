from __future__ import annotations

import uuid

from app.core.ai_gateway import AIGatewayPort
from app.core.palettes import normalize_locale
from app.modules.ai.service import compute_source_hash
from app.modules.menu.schemas import CategoryDTO, FullMenuDTO, ProductDTO
from app.modules.restaurants.schemas import RestaurantDTO
from app.modules.translations.repository import TranslationRepository
from app.modules.translations.schemas import TranslationUpsert

TRANSLATABLE_FIELDS = ("name", "description")


class TranslationService:
    def __init__(
        self,
        repo: TranslationRepository,
        gateway: AIGatewayPort,
    ) -> None:
        self._repo = repo
        self._gateway = gateway

    def translate_menu(
        self,
        menu: FullMenuDTO,
        restaurant: RestaurantDTO,
        locale: str,
    ) -> FullMenuDTO:
        target = normalize_locale(locale)
        source = normalize_locale(restaurant.original_language)
        if target == source:
            return menu

        categories = [
            self._translate_category(c, restaurant, target, source) for c in menu.categories
        ]
        products = [self._translate_product(p, restaurant, target, source) for p in menu.products]
        return menu.model_copy(update={"categories": categories, "products": products})

    def _translate_category(
        self,
        category: CategoryDTO,
        restaurant: RestaurantDTO,
        target: str,
        source: str,
    ) -> CategoryDTO:
        updates: dict[str, str] = {}
        for field in TRANSLATABLE_FIELDS:
            value = getattr(category, field)
            if value:
                updates[field] = self._translate_field(
                    restaurant.id,
                    "category",
                    category.id,
                    field,
                    value,
                    target,
                    source,
                )
        return category.model_copy(update=updates) if updates else category

    def _translate_product(
        self,
        product: ProductDTO,
        restaurant: RestaurantDTO,
        target: str,
        source: str,
    ) -> ProductDTO:
        updates: dict[str, str] = {}
        for field in TRANSLATABLE_FIELDS:
            value = getattr(product, field)
            if value:
                updates[field] = self._translate_field(
                    restaurant.id,
                    "product",
                    product.id,
                    field,
                    value,
                    target,
                    source,
                )
        return product.model_copy(update=updates) if updates else product

    def _translate_field(
        self,
        restaurant_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
        source_text: str,
        target_locale: str,
        source_locale: str,
    ) -> str:
        digest = compute_source_hash(source_text)
        existing = self._repo.get(restaurant_id, target_locale, entity_type, entity_id, field)
        if existing and existing.source_hash == digest:
            return existing.translated_text
        translated_map = self._gateway.translate_texts(
            {field: source_text},
            source_locale=source_locale,
            target_locale=target_locale,
        )
        translated = translated_map.get(field, source_text)
        self._repo.upsert(
            TranslationUpsert(
                restaurant_id=restaurant_id,
                locale=target_locale,
                entity_type=entity_type,
                entity_id=entity_id,
                field=field,
                translated_text=translated,
                source_hash=digest,
            )
        )
        self._repo.delete_stale(restaurant_id, entity_type, entity_id, field, digest)
        return translated
