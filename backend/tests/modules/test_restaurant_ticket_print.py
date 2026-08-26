from app.modules.restaurants.ticket_print import (
    DEFAULT_TICKET_PRINT_SETTINGS,
    normalize_ticket_print_settings,
)


def test_normalize_fills_defaults() -> None:
    settings = normalize_ticket_print_settings(None)
    assert settings.enabled is False
    assert settings.paper_width_mm == 80
    assert settings.copies == 1
    assert settings.brand_name == ""
    assert settings.footer_message == DEFAULT_TICKET_PRINT_SETTINGS.footer_message


def test_normalize_accepts_partial_dict() -> None:
    settings = normalize_ticket_print_settings(
        {
            "paper_width_mm": 58,
            "copies": 2,
            "brand_name": "  Tacos Pepe  ",
            "show_logo": False,
        }
    )
    assert settings.paper_width_mm == 58
    assert settings.copies == 2
    assert settings.brand_name == "Tacos Pepe"
    assert settings.show_logo is False
    assert settings.enabled is False


def test_normalize_clamps_invalid_values() -> None:
    settings = normalize_ticket_print_settings({"paper_width_mm": 40, "copies": 99})
    assert settings.paper_width_mm == 80
    assert settings.copies == 3
