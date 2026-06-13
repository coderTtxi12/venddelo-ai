import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

product_categories = Table(
    "product_categories",
    Base.metadata,
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        PG_UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Category(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "categories"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    products: Mapped[list["Product"]] = relationship(
        secondary=product_categories, back_populates="categories"
    )

    __table_args__ = (Index("ix_categories_listing", "restaurant_id", "is_active", "sort_index"),)


class Product(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "products"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="USD")
    image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    categories: Mapped[list["Category"]] = relationship(
        secondary=product_categories, back_populates="products"
    )
    option_groups: Mapped[list["OptionGroup"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "approval_status IN ('draft','pending_review','approved','rejected')",
            name="approval_status_allowed",
        ),
        Index("ix_products_publish", "restaurant_id", "is_active", "is_published"),
        Index("ix_products_review", "restaurant_id", "approval_status"),
    )


class OptionGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "option_groups"

    product_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    selection: Mapped[str] = mapped_column(String, nullable=False)
    min_selections: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    max_selections: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    product: Mapped["Product"] = relationship(back_populates="option_groups")
    items: Mapped[list["OptionItem"]] = relationship(
        back_populates="option_group", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("selection IN ('single','multi')", name="selection_allowed"),
        Index("ix_option_groups_product", "product_id"),
    )


class OptionItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "option_items"

    option_group_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("option_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    price_delta_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    option_group: Mapped["OptionGroup"] = relationship(back_populates="items")

    __table_args__ = (Index("ix_option_items_group", "option_group_id"),)
