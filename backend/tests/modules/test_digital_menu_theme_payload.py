from app.modules.assistant.skills.menu_write.theme_tools import _theme_payload
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRecord


def test_theme_payload_includes_colors_and_typography():
    record = DigitalMenuThemeRecord(
        id="original",
        label="Original",
        description="Neutral default.",
        best_for=["Any"],
        recommendation="Start here.",
        style_keywords=["neutral"],
        colors={"primary": "#111827", "accent": "#111827"},
        typography={
            "heading_font": "Inter",
            "body_font": "Inter",
            "heading_weight": 700,
            "body_weight": 400,
            "google_fonts_url": "",
            "mood": "neutral",
        },
        is_active=True,
        sort_order=0,
    )

    payload = _theme_payload(record)

    assert payload["colors"]["primary"] == "#111827"
    assert payload["typography"]["heading_font"] == "Inter"
