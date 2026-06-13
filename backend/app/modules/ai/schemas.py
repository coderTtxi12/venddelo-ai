import uuid
from datetime import datetime

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
