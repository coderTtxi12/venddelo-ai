from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PaperWidthMm = Literal[58, 80]
DEFAULT_FOOTER_MESSAGE = "¡Gracias por tu pedido!"


class TicketPrintSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    paper_width_mm: PaperWidthMm = 80
    copies: int = Field(default=1, ge=1, le=3)
    show_logo: bool = True
    brand_name: str = Field(default="", max_length=80)
    header_extra: str = Field(default="", max_length=240)
    footer_message: str = Field(default=DEFAULT_FOOTER_MESSAGE, max_length=240)
    show_customer: bool = True
    show_phone: bool = True
    show_address: bool = True
    show_payment: bool = True
    show_notes: bool = True
    show_order_type: bool = True
    show_datetime: bool = True
    show_items: bool = True
    show_restaurant_address: bool = True

    @field_validator("paper_width_mm", mode="before")
    @classmethod
    def _paper_width(cls, value: Any) -> PaperWidthMm:
        if value in (58, "58"):
            return 58
        return 80

    @field_validator("copies", mode="before")
    @classmethod
    def _copies(cls, value: Any) -> int:
        try:
            number = int(value)
        except (TypeError, ValueError):
            return 1
        return max(1, min(3, number))

    @field_validator("brand_name", mode="before")
    @classmethod
    def _brand(cls, value: Any) -> str:
        return str(value or "").strip()[:80]

    @field_validator("header_extra", "footer_message", mode="before")
    @classmethod
    def _text(cls, value: Any) -> str:
        return str(value or "").strip()[:240]


DEFAULT_TICKET_PRINT_SETTINGS = TicketPrintSettings()


def normalize_ticket_print_settings(value: object) -> TicketPrintSettings:
    if value is None or value == "":
        return TicketPrintSettings()
    if isinstance(value, TicketPrintSettings):
        return value
    if isinstance(value, dict):
        return TicketPrintSettings.model_validate(value)
    return TicketPrintSettings()
