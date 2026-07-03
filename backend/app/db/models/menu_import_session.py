from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MenuImportSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assistant_menu_import_sessions"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    discovery_answers: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="{}",
    )
    clarification_answers: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="{}",
    )
    source_files: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="[]",
    )
    product_images: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="[]",
    )
    draft_batches: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="[]",
    )
    selected_theme_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    enhance_descriptions: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )
    enhance_images: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )
    unmatched_images: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="[]",
    )
    uncertain_images: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="[]",
    )

    __table_args__ = (
        Index(
            "uq_assistant_menu_import_sessions_active_restaurant",
            "restaurant_id",
            unique=True,
            postgresql_where=text("status NOT IN ('completed', 'cancelled')"),
        ),
    )
