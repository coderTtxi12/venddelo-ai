import uuid
from datetime import time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Restaurant(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "restaurants"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    place_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    digital_menu_theme_id: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="original"
    )
    whatsapp_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    subdomain: Mapped[str] = mapped_column(String(63), nullable=False)
    color_palette: Mapped[str | None] = mapped_column(String(50), nullable=True)
    original_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="es")
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")
    takeout_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    delivery_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="America/Mexico_City"
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    schedules: Mapped[list["RestaurantSchedule"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )
    payment_methods: Mapped[list["RestaurantPaymentMethod"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("subdomain", name="uq_restaurants_subdomain"),
        CheckConstraint(
            "status IN ('draft','published','suspended')",
            name="status_allowed",
        ),
        Index("ix_restaurants_owner_id", "owner_id"),
    )


class RestaurantSchedule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "restaurant_schedules"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_type: Mapped[str] = mapped_column(String, nullable=False)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    opens_at: Mapped[time] = mapped_column(Time, nullable=False)
    closes_at: Mapped[time] = mapped_column(Time, nullable=False)

    restaurant: Mapped["Restaurant"] = relationship(back_populates="schedules")

    __table_args__ = (
        CheckConstraint("service_type IN ('takeout','delivery')", name="service_type_allowed"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="day_of_week_range"),
        Index("ix_schedules_lookup", "restaurant_id", "service_type", "day_of_week"),
    )


class RestaurantPaymentMethod(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "restaurant_payment_methods"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    method: Mapped[str] = mapped_column(String, nullable=False)
    service_type: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    restaurant: Mapped["Restaurant"] = relationship(back_populates="payment_methods")

    __table_args__ = (
        UniqueConstraint(
            "restaurant_id",
            "method",
            "service_type",
            name="uq_payment_method_service",
        ),
        CheckConstraint("method IN ('cash','transfer','card_terminal')", name="method_allowed"),
        CheckConstraint("service_type IN ('takeout','delivery')", name="pm_service_type_allowed"),
    )
