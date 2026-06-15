import uuid

from sqlalchemy import CheckConstraint, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    """App profile mirrored from Supabase Auth. id == auth.users.id."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False, server_default="owner")
    plan: Mapped[str] = mapped_column(String(30), nullable=False, server_default="free")
    billing_customer_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("role IN ('owner','admin','staff')", name="user_role_allowed"),
        CheckConstraint("plan IN ('free','pro','enterprise')", name="user_plan_allowed"),
    )
