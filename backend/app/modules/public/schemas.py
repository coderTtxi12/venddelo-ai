from pydantic import BaseModel


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
    whatsapp_phone: str | None = None
    original_language: str
