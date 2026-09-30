from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DeveloperApiKeyDTO(BaseModel):
    id: uuid.UUID
    label: str
    key_prefix: str
    created_at: datetime
    revoked_at: datetime | None = None


class DeveloperWebhookDTO(BaseModel):
    url: str | None = None
    is_enabled: bool = False
    notify_status: bool = True
    notify_location: bool = True
    secret_hint: str | None = None
    has_signing_secret: bool = False


class DeveloperWebhookTestSinkDTO(BaseModel):
    post_url: str
    events_url: str


class DeveloperSettingsDTO(BaseModel):
    webhook: DeveloperWebhookDTO
    api_keys: list[DeveloperApiKeyDTO]
    test_sink: DeveloperWebhookTestSinkDTO


class DeveloperWebhookUpdate(BaseModel):
    url: str | None = None
    is_enabled: bool | None = None
    notify_status: bool | None = None
    notify_location: bool | None = None


class DeveloperApiKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=64)


class DeveloperApiKeyCreatedDTO(DeveloperApiKeyDTO):
    api_key: str


class DeveloperWebhookSecretDTO(BaseModel):
    signing_secret: str
    secret_hint: str


class DeveloperWebhookTestResult(BaseModel):
    ok: bool
    status_code: int | None = None
    error: str | None = None
