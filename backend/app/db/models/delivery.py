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
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PG_UUID
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
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list["DeliveryProviderMember"]] = relationship(
        back_populates="delivery_provider", cascade="all, delete-orphan"
    )
    admin_invites: Mapped[list["DeliveryProviderAdminInvite"]] = relationship(
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
    assignment_settings: Mapped["DeliveryProviderAssignmentSettings | None"] = relationship(
        back_populates="delivery_provider",
        cascade="all, delete-orphan",
        uselist=False,
    )
    search_lead_times: Mapped[list["DeliverySearchLeadTime"]] = relationship(
        back_populates="delivery_provider",
        cascade="all, delete-orphan",
    )
    drivers: Mapped[list["DeliveryDriver"]] = relationship(
        back_populates="delivery_provider",
        cascade="all, delete-orphan",
    )
    dispatch_requests: Mapped[list["DeliveryDispatchRequest"]] = relationship(
        back_populates="delivery_provider",
    )

    __table_args__ = (
        UniqueConstraint("slug", name="uq_delivery_providers_slug"),
        CheckConstraint(
            "status IN ('draft','pending_review','active','rejected','suspended')",
            name="status_allowed",
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
            "member_role IN ('owner','admin','operator','dispatcher','driver')",
            name="member_role_allowed",
        ),
    )


class DeliveryProviderAdminInvite(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_admin_invites"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    member_role: Mapped[str] = mapped_column(String, nullable=False, server_default="admin")

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="admin_invites")

    __table_args__ = (
        UniqueConstraint("delivery_provider_id", "email"),
        Index("ix_delivery_provider_admin_invites_email", "email"),
        CheckConstraint(
            "member_role IN ('admin','operator')",
            name="delivery_provider_admin_invites_member_role_allowed",
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
    weather_mode: Mapped[str] = mapped_column(String, nullable=False, server_default="none")
    service_manually_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="zones")
    tariffs: Mapped[list["DeliveryProviderTariff"]] = relationship(back_populates="zone")

    __table_args__ = (
        CheckConstraint(
            "zone_kind IN ('polygon','radius')",
            name="zone_kind_allowed",
        ),
        CheckConstraint(
            "weather_mode IN ('none','light','heavy','intense')",
            name="ck_delivery_provider_zones_weather_mode_allowed",
        ),
        Index("ix_delivery_provider_zones_lookup", "delivery_provider_id", "is_active"),
        Index(
            "uq_delivery_provider_zones_name_per_provider",
            "delivery_provider_id",
            text("lower(btrim(name))"),
            unique=True,
        ),
    )


class DeliveryProviderSchedule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_provider_schedules"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_zones.id", ondelete="CASCADE"),
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
            "zone_id",
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
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_zones.id", ondelete="CASCADE"),
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
    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_zones.id", ondelete="RESTRICT"),
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


class DeliveryDriver(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_drivers"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    first_name: Mapped[str] = mapped_column(Text, nullable=False)
    last_name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    profile_photo_path: Mapped[str] = mapped_column(Text, nullable=False)
    ine_document_path: Mapped[str] = mapped_column(Text, nullable=False)
    license_document_path: Mapped[str] = mapped_column(Text, nullable=False)
    insurance_document_path: Mapped[str] = mapped_column(Text, nullable=False)
    credit_limit_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="50000"
    )
    credit_held_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    compartment_size: Mapped[str] = mapped_column(String, nullable=False)
    plate: Mapped[str] = mapped_column(Text, nullable=False)
    motorcycle_brand: Mapped[str] = mapped_column(Text, nullable=False)
    motorcycle_color: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="invited")
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    last_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fcm_token: Mapped[str | None] = mapped_column(Text, nullable=True)

    delivery_provider: Mapped["DeliveryProvider"] = relationship(back_populates="drivers")
    dispatch_requests: Mapped[list["DeliveryDispatchRequest"]] = relationship(
        back_populates="assigned_driver"
    )
    offers: Mapped[list["DeliveryDispatchOffer"]] = relationship(back_populates="driver")
    credit_holds: Mapped[list["DeliveryCreditHold"]] = relationship(back_populates="driver")

    __table_args__ = (
        Index(
            "uq_delivery_drivers_email_per_provider",
            "delivery_provider_id",
            text("lower(btrim(email))"),
            unique=True,
        ),
        CheckConstraint(
            "credit_held_cents >= 0 AND credit_held_cents <= credit_limit_cents",
            name="credit_bounds",
        ),
        CheckConstraint(
            "compartment_size IN ('normal','grande')",
            name="compartment_size_allowed",
        ),
        CheckConstraint(
            "status IN ('invited','active','blocked')",
            name="status_allowed",
        ),
        Index("ix_delivery_drivers_dispatch_lookup", "delivery_provider_id", "status", "is_online"),
    )


class DeliveryProviderAssignmentSettings(TimestampMixin, Base):
    __tablename__ = "delivery_provider_assignment_settings"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    offer_timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default="45")
    pre_free_eta_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default="60")
    driver_location_staleness_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="90"
    )
    min_protected_drivers: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2")
    high_demand_available_drivers_max: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="2"
    )
    high_demand_occupied_ratio: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0.80"
    )
    high_demand_pending_min: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    near_destination_radius_meters: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="800"
    )
    max_extra_route_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="8")
    max_pickup_detour_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="8"
    )
    max_destination_detour_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="8"
    )
    max_active_packages_per_driver: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="3"
    )
    assignment_retry_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="30"
    )
    assignment_timeout_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="900"
    )
    pre_free_speed_mps: Mapped[float] = mapped_column(Float, nullable=False, server_default="8")

    delivery_provider: Mapped["DeliveryProvider"] = relationship(
        back_populates="assignment_settings"
    )


class DeliverySearchLeadTime(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_search_lead_times"

    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    prep_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    search_ahead_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    delivery_provider: Mapped["DeliveryProvider"] = relationship(
        back_populates="search_lead_times"
    )

    __table_args__ = (
        UniqueConstraint("delivery_provider_id", "prep_minutes"),
        CheckConstraint("search_ahead_minutes >= 0", name="search_ahead_nonneg"),
    )


class DeliveryDispatchRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_dispatch_requests"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="RESTRICT"),
        nullable=False,
    )
    delivery_provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="RESTRICT"),
        nullable=False,
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_provider_zones.id", ondelete="RESTRICT"),
        nullable=False,
    )
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_phone: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_lat: Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_lng: Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_address: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_maps_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str] = mapped_column(String, nullable=False)
    collect_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    cash_denomination_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    package_size: Mapped[str] = mapped_column(String, nullable=False)
    package_count: Mapped[int] = mapped_column(Integer, nullable=False)
    ready_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    search_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quoted_fee_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    assigned_driver_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_drivers.id", ondelete="SET NULL"),
        nullable=True,
    )
    tracking_token: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cycle_rejected_driver_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(PG_UUID(as_uuid=True)),
        nullable=False,
        server_default=text("'{}'"),
        default=list,
    )
    cycle_silent_driver_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(PG_UUID(as_uuid=True)),
        nullable=False,
        server_default=text("'{}'"),
        default=list,
    )
    dispatch_group_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )

    delivery_provider: Mapped["DeliveryProvider"] = relationship(
        back_populates="dispatch_requests"
    )
    assigned_driver: Mapped["DeliveryDriver | None"] = relationship(
        back_populates="dispatch_requests"
    )
    offers: Mapped[list["DeliveryDispatchOffer"]] = relationship(back_populates="request")
    credit_hold: Mapped["DeliveryCreditHold | None"] = relationship(
        back_populates="request",
        uselist=False,
    )

    __table_args__ = (
        CheckConstraint("package_count >= 1", name="package_count_min"),
        CheckConstraint(
            "payment_method IN ('cash','transfer','card_terminal')",
            name="payment_method_allowed",
        ),
        CheckConstraint(
            "payment_method <> 'cash' OR cash_denomination_cents IS NOT NULL",
            name="cash_denomination_required",
        ),
        CheckConstraint(
            "package_size IN ('normal','grande')",
            name="package_size_allowed",
        ),
        CheckConstraint(
            "status IN ("
            "'scheduled','searching','offered','assigned','picked_up',"
            "'in_transit','delivered','unassigned','cancelled'"
            ")",
            name="status_allowed",
        ),
        Index("ix_delivery_dispatch_requests_provider_lookup", "delivery_provider_id", "status", "search_at"),
        Index("ix_delivery_dispatch_requests_driver_lookup", "assigned_driver_id", "status"),
    )


class DeliveryDispatchOffer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_dispatch_offers"

    request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_dispatch_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_drivers.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String, nullable=False)
    case_applied: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    score_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request: Mapped["DeliveryDispatchRequest"] = relationship(back_populates="offers")
    driver: Mapped["DeliveryDriver"] = relationship(back_populates="offers")

    __table_args__ = (
        CheckConstraint(
            "status IN ('offered','accepted','rejected','expired')",
            name="status_allowed",
        ),
        CheckConstraint(
            "case_applied IN ('A','B','C','D')",
            name="case_applied_allowed",
        ),
        Index(
            "uq_delivery_dispatch_offers_one_offered_per_driver",
            "driver_id",
            unique=True,
            postgresql_where=text("status = 'offered'"),
        ),
        Index(
            "uq_delivery_dispatch_offers_one_offered_per_request",
            "request_id",
            unique=True,
            postgresql_where=text("status = 'offered'"),
        ),
    )


class DeliveryCreditHold(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_credit_holds"

    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_drivers.id", ondelete="CASCADE"),
        nullable=False,
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_dispatch_requests.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    driver: Mapped["DeliveryDriver"] = relationship(back_populates="credit_holds")
    request: Mapped["DeliveryDispatchRequest"] = relationship(back_populates="credit_hold")

    __table_args__ = (
        CheckConstraint(
            "status IN ('held','released')",
            name="status_allowed",
        ),
    )
