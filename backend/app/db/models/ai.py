import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AIArtifact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_artifacts"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    original_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    optimized_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="applied")

    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('product','category','restaurant')",
            name="ai_entity_type_allowed",
        ),
        CheckConstraint("status IN ('applied','reverted')", name="ai_artifact_status_allowed"),
        Index("ix_ai_artifacts_entity", "restaurant_id", "entity_type", "entity_id"),
    )


class MenuTranslation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "menu_translations"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "restaurant_id",
            "locale",
            "entity_type",
            "entity_id",
            "field",
            name="uq_menu_translation_unique",
        ),
        Index(
            "ix_menu_translations_lookup",
            "restaurant_id",
            "locale",
            "entity_type",
            "entity_id",
        ),
    )
