from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.session_schemas import (
    TERMINAL_STATUSES,
    MenuImportSessionStatus,
)


class MenuImportSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_active_for_restaurant(self, restaurant_id: uuid.UUID) -> MenuImportSession | None:
        terminal_values = [status.value for status in TERMINAL_STATUSES]
        return self._session.scalars(
            select(MenuImportSession)
            .where(
                MenuImportSession.restaurant_id == restaurant_id,
                MenuImportSession.status.notin_(terminal_values),
            )
            .limit(1)
        ).first()

    def create(
        self,
        *,
        restaurant_id: uuid.UUID,
        conversation_id: uuid.UUID,
        status: MenuImportSessionStatus | str = MenuImportSessionStatus.DISCOVERY,
    ) -> MenuImportSession:
        status_value = status.value if isinstance(status, MenuImportSessionStatus) else status
        obj = MenuImportSession(
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            status=status_value,
        )
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return obj

    def update(self, session: MenuImportSession) -> MenuImportSession:
        self._session.add(session)
        self._session.flush()
        self._session.refresh(session)
        return session

    def cancel_active(self, restaurant_id: uuid.UUID) -> None:
        active = self.get_active_for_restaurant(restaurant_id)
        if active is None:
            return
        active.status = MenuImportSessionStatus.CANCELLED.value
        self._session.flush()
        self._session.refresh(active)
