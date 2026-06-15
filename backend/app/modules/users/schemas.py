import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    id: uuid.UUID
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: str = "owner"
    plan: str = "free"


class UserUpdate(BaseModel):
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: str | None = None
    plan: str | None = None
    billing_customer_id: str | None = None


class UserDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: str
    plan: str
    billing_customer_id: str | None = None
    created_at: datetime
    updated_at: datetime


class UserProfileUpdate(BaseModel):
    """Fields the authenticated user may update on their own profile."""

    display_name: str | None = None
    avatar_url: str | None = None
