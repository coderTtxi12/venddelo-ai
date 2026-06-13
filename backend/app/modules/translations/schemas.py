import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TranslationUpsert(BaseModel):
    restaurant_id: uuid.UUID
    locale: str
    entity_type: str
    entity_id: uuid.UUID
    field: str
    translated_text: str
    source_hash: str


class TranslationDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    locale: str
    entity_type: str
    entity_id: uuid.UUID
    field: str
    translated_text: str
    source_hash: str
    created_at: datetime
    updated_at: datetime
