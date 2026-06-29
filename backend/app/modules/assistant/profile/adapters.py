from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models.assistant_profile import RestaurantAssistantProfile
from app.modules.assistant.profile.behavior_markdown import (
    behavior_markdown_for_persist,
    behavior_markdown_for_runtime,
)
from app.modules.assistant.profile.identity_markdown import (
    identity_markdown_for_persist,
    identity_markdown_for_runtime,
)
from app.modules.assistant.profile.menu_markdown import (
    menu_markdown_for_persist,
    menu_markdown_for_runtime,
)
from app.modules.assistant.profile.schemas import (
    AssistantProfileRecord,
    AssistantProfileRepository,
)


def _to_record(obj: RestaurantAssistantProfile) -> AssistantProfileRecord:
    return AssistantProfileRecord(
        restaurant_id=obj.restaurant_id,
        display_name=obj.display_name,
        identity_markdown=identity_markdown_for_runtime(obj.identity_markdown),
        # behavior_markdown=obj.behavior_markdown,
        behavior_markdown=behavior_markdown_for_runtime(obj.behavior_markdown),
        menu_markdown=menu_markdown_for_runtime(obj.menu_markdown),
        enabled_skill_ids=list(obj.enabled_skill_ids or []),
        version=obj.version,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


class SqlAlchemyAssistantProfileRepository(AssistantProfileRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, restaurant_id: uuid.UUID) -> AssistantProfileRecord | None:
        obj = self._session.get(RestaurantAssistantProfile, restaurant_id)
        return _to_record(obj) if obj else None

    def create(
        self,
        *,
        restaurant_id: uuid.UUID,
        identity_markdown: str,
        behavior_markdown: str,
        menu_markdown: str,
        enabled_skill_ids: list[str],
    ) -> AssistantProfileRecord:
        obj = RestaurantAssistantProfile(
            restaurant_id=restaurant_id,
            identity_markdown=identity_markdown_for_persist(identity_markdown),
            # behavior_markdown=behavior_markdown,
            behavior_markdown=behavior_markdown_for_persist(behavior_markdown),
            menu_markdown=menu_markdown_for_persist(menu_markdown),
            enabled_skill_ids=enabled_skill_ids,
            version=1,
        )
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return _to_record(obj)

    def update(
        self,
        restaurant_id: uuid.UUID,
        *,
        expected_version: int,
        display_name: str | None = None,
        identity_markdown: str | None = None,
        behavior_markdown: str | None = None,
        menu_markdown: str | None = None,
        enabled_skill_ids: list[str] | None = None,
    ) -> AssistantProfileRecord | None:
        obj = self._session.get(RestaurantAssistantProfile, restaurant_id)
        if obj is None or obj.version != expected_version:
            return None

        if display_name is not None:
            obj.display_name = display_name.strip()
        # Temporarily disabled — see profile/identity_markdown.py
        # if identity_markdown is not None:
        #     obj.identity_markdown = identity_markdown
        _ = identity_markdown
        # Temporarily disabled — see profile/behavior_markdown.py
        # if behavior_markdown is not None:
        #     obj.behavior_markdown = behavior_markdown
        _ = behavior_markdown
        # Temporarily disabled — see profile/menu_markdown.py
        # if menu_markdown is not None:
        #     obj.menu_markdown = menu_markdown
        _ = menu_markdown
        if enabled_skill_ids is not None:
            obj.enabled_skill_ids = enabled_skill_ids

        obj.version = expected_version + 1
        obj.updated_at = datetime.now(UTC)
        self._session.flush()
        self._session.refresh(obj)
        return _to_record(obj)
