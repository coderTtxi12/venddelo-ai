import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

coupon_products = Table(
    "coupon_products",
    Base.metadata,
    Column(
        "coupon_id",
        PG_UUID(as_uuid=True),
        ForeignKey("coupons.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

coupon_categories = Table(
    "coupon_categories",
    Base.metadata,
    Column(
        "coupon_id",
        PG_UUID(as_uuid=True),
        ForeignKey("coupons.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        PG_UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Coupon(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "coupons"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scope: Mapped[str] = mapped_column(String, nullable=False)
    stock_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    __table_args__ = (
        CheckConstraint("type IN ('amount','percent','free_shipping')", name="coupon_type_allowed"),
        CheckConstraint("scope IN ('all','category','product')", name="coupon_scope_allowed"),
        CheckConstraint(
            "type <> 'percent' OR (percent BETWEEN 1 AND 100)", name="coupon_percent_range"
        ),
        CheckConstraint("type <> 'amount' OR amount_cents > 0", name="coupon_amount_positive"),
        CheckConstraint("stock_qty IS NULL OR stock_qty >= 0", name="coupon_stock_nonneg"),
        Index(
            "uq_coupons_restaurant_code_alive",
            "restaurant_id",
            "code",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class CouponRedemption(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "coupon_redemptions"

    coupon_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("order_id", name="uq_coupon_redemptions_order_id"),)
