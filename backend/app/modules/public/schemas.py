from datetime import datetime
from typing import Any
import uuid

from pydantic import BaseModel, Field

from app.modules.promotions.schemas import PromotionDTO


class PublicRestaurantDTO(BaseModel):
    name: str
    description: str | None = None
    subdomain: str
    logo_path: str | None = None
    cover_path: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    takeout_enabled: bool = True
    delivery_enabled: bool = True
    color_palette: str | None = None
    digital_menu_theme_id: str = "original"
    digital_menu_promotions_category_enabled: bool = True
    digital_menu_promotions_category_name: str = "Promociones"
    digital_menu_limited_time_category_enabled: bool = True
    digital_menu_limited_time_category_name: str = "Por tiempo limitado"
    whatsapp_phone: str | None = None
    original_language: str
    timezone: str = "America/Mexico_City"
    server_now: datetime | None = None


class PublicPromotionsContextDTO(BaseModel):
    server_now: datetime
    timezone: str
    local_now: datetime
    items: list[PromotionDTO] = Field(default_factory=list)


class CartQuoteLineInput(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1)
    selected_options: dict[str, Any] | None = None


class CartQuoteInput(BaseModel):
    items: list[CartQuoteLineInput]


class CartQuoteLineDTO(BaseModel):
    product_id: uuid.UUID
    quantity: int
    unit_base_cents: int
    options_cents: int
    discount_cents: int
    line_total_cents: int
    badge: str | None = None
    applied_promotion_id: uuid.UUID | None = None
    promo_warnings: list[str] = Field(default_factory=list)


class CartQuoteDTO(BaseModel):
    server_now: datetime
    timezone: str
    lines: list[CartQuoteLineDTO]
    subtotal_before_discount_cents: int
    order_discount_cents: int
    total_cents: int
    applied_order_promotion_id: uuid.UUID | None = None
