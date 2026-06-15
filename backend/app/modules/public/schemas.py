from pydantic import BaseModel


class PublicRestaurantDTO(BaseModel):
    name: str
    subdomain: str
    color_palette: str | None = None
    whatsapp_phone: str | None = None
    original_language: str
