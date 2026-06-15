import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AIArtifactCreate(BaseModel):
    restaurant_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    field: str
    original_value: str | None = None
    optimized_value: str | None = None
    status: str = "applied"


class AIArtifactDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    field: str
    original_value: str | None = None
    optimized_value: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class AIJobCreate(BaseModel):
    restaurant_id: uuid.UUID
    job_type: str
    status: str = "pending"
    input_ref: str | None = None


class AIJobUpdate(BaseModel):
    status: str | None = None
    result_json: dict[str, Any] | None = None
    error_message: str | None = None


class AIJobDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    job_type: str
    status: str
    input_ref: str | None = None
    result_json: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
