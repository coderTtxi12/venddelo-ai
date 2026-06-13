from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.models.ai import MenuTranslation
from app.modules.translations.repository import TranslationRepository
from app.modules.translations.schemas import TranslationDTO, TranslationUpsert


class SqlAlchemyTranslationRepository(TranslationRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(
        self,
        restaurant_id: uuid.UUID,
        locale: str,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
    ) -> TranslationDTO | None:
        obj = self._session.scalar(
            select(MenuTranslation).where(
                MenuTranslation.restaurant_id == restaurant_id,
                MenuTranslation.locale == locale,
                MenuTranslation.entity_type == entity_type,
                MenuTranslation.entity_id == entity_id,
                MenuTranslation.field == field,
            )
        )
        return TranslationDTO.model_validate(obj) if obj else None

    def upsert(self, data: TranslationUpsert) -> TranslationDTO:
        stmt = (
            pg_insert(MenuTranslation)
            .values(**data.model_dump())
            .on_conflict_do_update(
                index_elements=[
                    "restaurant_id",
                    "locale",
                    "entity_type",
                    "entity_id",
                    "field",
                ],
                set_={
                    "translated_text": data.translated_text,
                    "source_hash": data.source_hash,
                },
            )
            .returning(MenuTranslation)
        )
        obj = self._session.scalars(stmt).one()
        self._session.flush()
        return TranslationDTO.model_validate(obj)

    def list_for_menu(self, restaurant_id: uuid.UUID, locale: str) -> list[TranslationDTO]:
        rows = self._session.scalars(
            select(MenuTranslation).where(
                MenuTranslation.restaurant_id == restaurant_id,
                MenuTranslation.locale == locale,
            )
        )
        return [TranslationDTO.model_validate(r) for r in rows]

    def delete_stale(
        self,
        restaurant_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        field: str,
        current_source_hash: str,
    ) -> int:
        result = self._session.execute(
            delete(MenuTranslation).where(
                MenuTranslation.restaurant_id == restaurant_id,
                MenuTranslation.entity_type == entity_type,
                MenuTranslation.entity_id == entity_id,
                MenuTranslation.field == field,
                MenuTranslation.source_hash != current_source_hash,
            )
        )
        self._session.flush()
        return int(result.rowcount or 0)
