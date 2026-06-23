import uuid
from datetime import datetime, time

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DeliveryProvider(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_providers"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    legal_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    slug: Mapped[str] = mapped_column(String(63), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    responsible_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsible_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    logo_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="America/Mexico_City"
    )
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")
    service_manually_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    weather_mode: Mapped[str] = mapped_column(String, nullable=False, server_default="none")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list["DeliveryProviderMember"]] = relationship(
        back_populates="delivery_provider", cascade="all, delete-orphan"
    )
    zones: Mapped[list["DeliveryProviderZone"]] = relationship(
        back_populates="delivery_provider", cascade="all, delete-orphan"
    )
    schedules: Mapped[list["DeliveryProviderSchedule"]] = relationship(
        back_populates="delivery_provider", cascade="all, delete-orphan"
    )
    tariffs: Mapped[list["DeliveryProviderTariff"]] = relationship(
        back_populates="delivery_provider", cascade="all, delete-orphan"
    )
    restaurant_links: Mapped[list["RestaurantDeliveryProvider"]] = relationship(
        back_populates="delivery_provider", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["DeliveryAssignment"]] = relationship(
        back_populates="delivery_provider"
    )
    pricing_config: Mapped["DeliveryProviderPricingConfig | None"] = relationship(
        back_populates="delivery_provider",
        cascade="all, delete-orphan",
        uselist=False,
    )
    payment_methods: Mapped[list["DeliveryProviderPaymentMethod"]] = relationship(
        back_populates="delivery_provider",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("slug", name="uq_delivery_providers_slug"),
        CheckConstraint(
            "status IN ('draft','pending_review','active','rejected','suspended')",
            name="status_allowed",
        ),
        CheckConstraint(
            "weather_mode IN ('none','light','heavy','intense')",
            name="weather_mode_allowed",
        ),
        Index("ix_delivery_providers_status", "status"),
    )


class DeliveryProviderMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_members"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    member_role: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="members")

    __table_args__ = (
        UniqueConstraint("delivery_provider_id", "user_id"),
        CheckConstraint(
            "member_role IN ('owner','admin','dispatcher','driver')",
            name="member_role_allowed",
        ),
    )


class DeliveryProviderZone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_zones"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    zone_kind: Mapped[str] = mapped_column(String, nullable=False)
    boundary: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POLYGON", srid=4326, spatial_index=False),
        nullable=True,
    )
    center_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="zones")
    tariffs: Mapped[list["DeliveryProviderTariff"]] = relationship(back_populates="zone")

    __table_args__ = (
        CheckConstraint(
            "zone_kind IN ('polygon','radius')",
            name="zone_kind_allowed",
        ),
        Index("ix_delivery_provider_zones_lookup", "delivery_provider_id", "is_active"),
    )


class DeliveryProviderSchedule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_schedules"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    schedule_kind: Mapped[str] = mapped_column(String, nullable=False, server_default="regular")
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    opens_at: Mapped[time] = mapped_column(Time, nullable=False)
    closes_at: Mapped[time] = mapped_column(Time, nullable=False)

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="schedules")

    __table_args__ = (
        CheckConstraint(
            "schedule_kind IN ('regular', 'night')",
            name="schedule_kind_allowed",
        ),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="day_of_week_range"),
        Index(
            "ix_delivery_provider_schedules_lookup",
            "delivery_provider_id",
            "schedule_kind",
            "day_of_week",
        ),
    )


class DeliveryProviderTariff(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_tariffs"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_zones.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    pricing_model: Mapped[str] = mapped_column(String, nullable=False)
    base_fee_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    per_km_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    free_distance_meters: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    max_distance_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_order_subtotal_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="MXN")
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    effective_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="tariffs")
    zone: Mapped["DeliveryProviderZone | None"] = relationship(back_populates="tariffs")

    __table_args__ = (
        CheckConstraint("base_fee_cents >= 0", name="base_fee_nonneg"),
        CheckConstraint(
            "pricing_model IN ('flat','distance','zone_flat','zone_distance')",
            name="pricing_model_allowed",
        ),
        Index(
            "ix_delivery_provider_tariffs_lookup",
            "delivery_provider_id",
            "is_active",
            "effective_from",
        ),
    )


class DeliveryProviderPricingConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_pricing_configs"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    inside_polygon: Mapped[dict] = mapped_column(JSONB, nullable=False)
    outside_polygon: Mapped[dict] = mapped_column(JSONB, nullable=False)

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="pricing_config")


class RestaurantDeliveryProvider(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "restaurant_delivery_providers"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    delivery_provider: Mapped["DeliveryProvider"] = relationship(
        back_populates="restaurant_links"
    )

    __table_args__ = (
        UniqueConstraint("restaurant_id", "delivery_provider_id"),
        CheckConstraint(
            "status IN ('pending','active','suspended')",
            name="status_allowed",
        ),
        Index(
            "uq_restaurant_delivery_providers_default",
            "restaurant_id",
            unique=True,
            postgresql_where=text("is_default = true AND status = 'active'"),
        ),
    )


class DeliveryProviderPaymentMethod(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_payment_methods"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    method: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="payment_methods")

    __table_args__ = (
        UniqueConstraint(
            "delivery_provider_id",
            "method",
            name="uq_delivery_provider_payment_method",
        ),
        CheckConstraint(
            "method IN ('cash','transfer','card_terminal')",
            name="delivery_payment_method_allowed",
        ),
        Index("ix_delivery_provider_payment_methods_lookup", "delivery_provider_id"),
    )


class DeliveryAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_assignments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="RESTRICT"),
        nullable=False,
    )
    tariff_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_tariffs.id", ondelete="SET NULL"),
        nullable=True,
    )
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_zones.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="quoted")
    quoted_fee_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    delivery_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    pickup_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    pickup_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    assigned_driver_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="assignments")

    __table_args__ = (
        CheckConstraint(
            "status IN ('quoted','assigned','picked_up','in_transit',"
            "'delivered','failed','cancelled')",
            name="status_allowed",
        ),
        Index("ix_delivery_assignments_listing", "delivery_provider_id", "status", "created_at"),
    )
