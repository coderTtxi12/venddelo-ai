from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.modules.translations.schemas import TranslationDTO, TranslationUpsert


class TranslationRepository(ABC):
    @abstractmethod
    def get(
        self,
        restaurant_id: uuid.UUID,
        locale: str,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
    ) -> TranslationDTO | None: ...

    @abstractmethod
    def upsert(self, data: TranslationUpsert) -> TranslationDTO: ...

    @abstractmethod
    def list_for_menu(self, restaurant_id: uuid.UUID, locale: str) -> list[TranslationDTO]: ...

    @abstractmethod
    def delete_stale(
        self,
        restaurant_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
        current_source_hash: str,
    ) -> int: ...
