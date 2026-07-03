from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DigitalMenuTheme(Base):
    __tablename__ = "digital_menu_themes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    best_for: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    recommendation: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    style_keywords: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
