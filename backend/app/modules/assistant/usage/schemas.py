from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class LLMUsageCreate(BaseModel):
    restaurant_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    message_id: uuid.UUID | None = None
    call_type: str = Field(min_length=1, max_length=40)
    provider: str = Field(min_length=1, max_length=40)
    model: str = Field(min_length=1, max_length=120)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cost_usd: Decimal
    metadata: dict[str, Any] | None = None

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class LLMUsageRecord(LLMUsageCreate):
    id: uuid.UUID
    created_at: datetime


class LLMUsageByCallType(BaseModel):
    call_type: str
    calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_usd: Decimal


class LLMUsageSummary(BaseModel):
    restaurant_id: uuid.UUID
    calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_usd: Decimal
    by_call_type: list[LLMUsageByCallType] = Field(default_factory=list)
