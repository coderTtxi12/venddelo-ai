import pytest

from app.modules.delivery_providers.pricing import (
    default_pricing_config,
    find_outside_bracket,
    quote_delivery_fee,
    validate_pricing_config,
)


def test_default_outside_bracket_at_5km():
    config = default_pricing_config()
    bracket = find_outside_bracket(config, 5)
    assert bracket is not None
    assert bracket.repa_cents == 6500
    assert bracket.restaurant_cents == 6500


def test_inside_polygon_day_quote():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=True,
        distance_km=None,
        is_night=False,
        weather_mode="none",
    )
    assert quote.available is True
    assert quote.total_cents == 3500


def test_inside_polygon_night_quote():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=True,
        distance_km=None,
        is_night=True,
        weather_mode="none",
    )
    assert quote.available is True
    assert quote.total_cents == 5000


def test_inside_polygon_heavy_rain_night_quote():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=True,
        distance_km=None,
        is_night=True,
        weather_mode="heavy",
    )
    assert quote.available is True
    assert quote.total_cents == 10000


def test_inside_polygon_light_rain_day_quote():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=True,
        distance_km=None,
        is_night=False,
        weather_mode="light",
    )
    assert quote.available is True
    assert quote.total_cents == 5000


def test_inside_polygon_legacy_json_format():
    from app.modules.delivery_providers.pricing import config_from_json

    config = config_from_json(
        {
            "inside_polygon": {"day_cents": 3500, "night_cents": 5000},
            "outside_polygon": {
                "max_distance_km": 20,
                "brackets": [],
            },
        }
    )
    assert config.inside_polygon.none.day_cents == 3500
    assert config.inside_polygon.light.day_cents == 5000
    assert config.inside_polygon.heavy.night_cents == 10000


def test_outside_rain_light_quote():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=False,
        distance_km=8.5,
        is_night=False,
        weather_mode="light",
    )
    assert quote.available is True
    assert quote.total_cents == 12500


def test_outside_intense_rain_suspended():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=False,
        distance_km=5,
        is_night=False,
        weather_mode="intense",
    )
    assert quote.available is False
    assert quote.reason == "Servicio suspendido por lluvia intensa"


def test_outside_distance_over_max_rejected():
    config = default_pricing_config()
    quote = quote_delivery_fee(
        config,
        inside_polygon=False,
        distance_km=20.5,
        is_night=False,
        weather_mode="none",
    )
    assert quote.available is False


def test_outside_bracket_matches_explicit_range():
    config = default_pricing_config()
    bracket = find_outside_bracket(config, 3.5)
    assert bracket is not None
    assert bracket.min_km == 3.1
    assert bracket.max_km == 4
    assert bracket.repa_cents == 5500


def test_outside_bracket_uses_next_tier_after_3km():
    config = default_pricing_config()
    bracket = find_outside_bracket(config, 3.05)
    assert bracket is not None
    assert bracket.max_km == 4
    assert bracket.repa_cents == 5500


def test_validate_pricing_config_rejects_negative():
    config = default_pricing_config()
    broken = default_pricing_config()
    object.__setattr__(
        broken.inside_polygon,
        "none",
        type(broken.inside_polygon.none)(day_cents=-1, night_cents=5000),
    )
    with pytest.raises(ValueError):
        validate_pricing_config(broken)
