from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.models.digital_menu_theme import DigitalMenuTheme


@dataclass(frozen=True)
class DigitalMenuThemeRecord:
    id: str
    label: str
    description: str
    best_for: list[str]
    recommendation: str
    style_keywords: list[str]
    is_active: bool
    sort_order: int


def _to_record(obj: DigitalMenuTheme) -> DigitalMenuThemeRecord:
    return DigitalMenuThemeRecord(
        id=obj.id,
        label=obj.label,
        description=obj.description,
        best_for=list(obj.best_for or []),
        recommendation=obj.recommendation,
        style_keywords=list(obj.style_keywords or []),
        is_active=obj.is_active,
        sort_order=obj.sort_order,
    )


class DigitalMenuThemeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_active(self) -> list[DigitalMenuThemeRecord]:
        rows = self._session.scalars(
            select(DigitalMenuTheme)
            .where(DigitalMenuTheme.is_active.is_(True))
            .order_by(DigitalMenuTheme.sort_order, DigitalMenuTheme.id)
        ).all()
        return [_to_record(row) for row in rows]

    def upsert(self, data: dict[str, Any]) -> DigitalMenuThemeRecord:
        values = {
            "id": data["id"],
            "label": data["label"],
            "description": data["description"],
            "best_for": list(data.get("best_for") or data.get("bestFor") or []),
            "recommendation": data.get("recommendation") or "",
            "style_keywords": list(data.get("style_keywords") or []),
            "is_active": data.get("is_active", True),
            "sort_order": int(data.get("sort_order", 0)),
        }
        stmt = (
            pg_insert(DigitalMenuTheme)
            .values(**values)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "label": values["label"],
                    "description": values["description"],
                    "best_for": values["best_for"],
                    "recommendation": values["recommendation"],
                    "style_keywords": values["style_keywords"],
                    "is_active": values["is_active"],
                    "sort_order": values["sort_order"],
                },
            )
            .returning(DigitalMenuTheme)
        )
        obj = self._session.scalars(stmt).one()
        self._session.flush()
        return _to_record(obj)
