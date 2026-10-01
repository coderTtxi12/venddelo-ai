from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

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


class DeveloperJustoDTO(BaseModel):
    inbound_url: str | None = None
    signing_secret: str | None = None


class DeveloperSettingsDTO(BaseModel):
    webhook: DeveloperWebhookDTO
    api_keys: list[DeveloperApiKeyDTO]
    justo: DeveloperJustoDTO = Field(default_factory=DeveloperJustoDTO)


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


class DeveloperSentEventDTO(BaseModel):
    received_at: str
    body: dict[str, Any]
    delivered: bool | None = None


class DeveloperSentEventsResponse(BaseModel):
    items: list[DeveloperSentEventDTO]


class JustoReceiptDTO(BaseModel):
    received_at: datetime
    result: str
    payload: dict[str, Any]


class JustoReceiptsResponse(BaseModel):
    items: list[JustoReceiptDTO]
