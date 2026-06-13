import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

promotion_products = Table(
    "promotion_products",
    Base.metadata,
    Column(
        "promotion_id",
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

promotion_categories = Table(
    "promotion_categories",
    Base.metadata,
    Column(
        "promotion_id",
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        PG_UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Promotion(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "promotions"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scope: Mapped[str] = mapped_column(String, nullable=False)
    min_order_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "type IN ('percent','amount','combo','two_for_one')",
            name="promotion_type_allowed",
        ),
        CheckConstraint(
            "scope IN ('product','category','order')",
            name="promotion_scope_allowed",
        ),
        Index("ix_promotions_active", "restaurant_id", "is_active"),
    )
