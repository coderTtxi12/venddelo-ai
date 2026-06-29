from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime

from pydantic import BaseModel, Field

MAX_DISPLAY_NAME_LEN = 80
MAX_IDENTITY_MARKDOWN_LEN = 8192
MAX_BEHAVIOR_MARKDOWN_LEN = 8192
MAX_MENU_MARKDOWN_LEN = 16384


class AssistantProfileRecord(BaseModel):
    restaurant_id: uuid.UUID
    display_name: str = ""
    identity_markdown: str
    behavior_markdown: str
    menu_markdown: str = ""
    enabled_skill_ids: list[str] = Field(default_factory=list)
    version: int = 1
    created_at: datetime
    updated_at: datetime


class AssistantProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=MAX_DISPLAY_NAME_LEN)
    identity_markdown: str | None = Field(default=None, max_length=MAX_IDENTITY_MARKDOWN_LEN)
    behavior_markdown: str | None = Field(default=None, max_length=MAX_BEHAVIOR_MARKDOWN_LEN)
    menu_markdown: str | None = Field(default=None, max_length=MAX_MENU_MARKDOWN_LEN)
    enabled_skill_ids: list[str] | None = None
    expected_version: int


class AssistantProfileSnapshot(BaseModel):
    display_name: str = ""
    identity_markdown: str
    behavior_markdown: str
    menu_markdown: str = ""
    enabled_skill_ids: list[str] = Field(default_factory=list)


class SkillCatalogEntryDTO(BaseModel):
    id: str
    label: str
    granted: bool
    enabled: bool
    effective: bool
    required_plan: str
    lock_reason: str | None = None


class AssistantProfileResponse(BaseModel):
    restaurant_id: uuid.UUID
    display_name: str
    identity_markdown: str
    behavior_markdown: str
    menu_markdown: str
    enabled_skill_ids: list[str]
    granted_skill_ids: list[str]
    effective_skill_ids: list[str]
    skills_catalog: list[SkillCatalogEntryDTO]
    version: int
    chat_ready: bool
    updated_at: datetime


class AssistantProfileRepository(ABC):
    @abstractmethod
    def get(self, restaurant_id: uuid.UUID) -> AssistantProfileRecord | None: ...

    @abstractmethod
    def create(
        self,
        *,
        restaurant_id: uuid.UUID,
        identity_markdown: str,
        behavior_markdown: str,
        menu_markdown: str,
        enabled_skill_ids: list[str],
    ) -> AssistantProfileRecord: ...

    @abstractmethod
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
    ) -> AssistantProfileRecord | None: ...
