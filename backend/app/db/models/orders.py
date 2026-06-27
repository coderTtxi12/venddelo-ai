import uuid
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="RESTRICT"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_phone: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str] = mapped_column(String, nullable=False)
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    subtotal_before_discount_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    applied_order_promotion_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="SET NULL"),
        nullable=True,
    )
    applied_order_discounts: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_fee_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    delivery_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="SET NULL"),
        nullable=True,
    )
    cash_denomination_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("type IN ('takeout','delivery')", name="order_type_allowed"),
        CheckConstraint(
            "payment_method IN ('cash','transfer','card_terminal')",
            name="order_payment_method_allowed",
        ),
        CheckConstraint(
            "status IN ('pending','confirmed','preparing','ready'," "'delivered','cancelled')",
            name="order_status_allowed",
        ),
        Index("ix_orders_listing", "restaurant_id", "status", "created_at"),
    )


class OrderItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
    )
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    product_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    selected_options: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    applied_discounts: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    line_subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    line_total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    applied_promotion_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="SET NULL"),
        nullable=True,
    )

    order: Mapped["Order"] = relationship(back_populates="items")

    __table_args__ = (Index("ix_order_items_order", "order_id"),)
