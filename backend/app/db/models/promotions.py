import uuid
from datetime import datetime, time

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Table,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import ARRAY
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


promotion_option_items = Table(
    "promotion_option_items",
    Base.metadata,
    Column(
        "promotion_id",
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "option_item_id",
        PG_UUID(as_uuid=True),
        ForeignKey("option_items.id", ondelete="CASCADE"),
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
    bundle_get_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bundle_pay_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bundle_pairing_mode: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="cross_product"
    )
    recurrence_weekdays: Mapped[list[int] | None] = mapped_column(
        ARRAY(SmallInteger), nullable=True
    )
    recurrence_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    recurrence_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "type IN ('percent','amount','combo','two_for_one')",
            name="promotion_type_allowed",
        ),
        CheckConstraint(
            "scope IN ('product','category','order')",
            name="promotion_scope_allowed",
        ),
        CheckConstraint(
            "bundle_pairing_mode IN ('cross_product','same_product')",
            name="promotion_bundle_pairing_mode_allowed",
        ),
        Index("ix_promotions_active", "restaurant_id", "is_active"),
    )
