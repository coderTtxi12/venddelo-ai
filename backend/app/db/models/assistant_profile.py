from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class RestaurantAssistantProfile(TimestampMixin, Base):
    __tablename__ = "restaurant_assistant_profiles"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_name: Mapped[str] = mapped_column(String(80), nullable=False, server_default="")
    identity_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    behavior_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    menu_markdown: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    enabled_skill_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class RestaurantAssistantEntitlement(Base):
    __tablename__ = "restaurant_assistant_entitlements"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    granted_extra: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    revoked: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )
