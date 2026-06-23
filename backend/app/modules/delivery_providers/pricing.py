from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DeliveryWeatherMode = Literal["none", "light", "heavy", "intense"]


@dataclass(frozen=True)
class OutsideTariffBracket:
    min_km: float
    max_km: float
    repa_cents: int
    mexy_cents: int
    restaurant_cents: int
    rain_light_cents: int
    rain_heavy_cents: int


@dataclass(frozen=True)
class InsidePolygonTariffs:
    day_cents: int
    night_cents: int


@dataclass(frozen=True)
class OutsidePolygonTariffs:
    max_distance_km: float
    brackets: tuple[OutsideTariffBracket, ...]


@dataclass(frozen=True)
class DeliveryPricingConfig:
    inside_polygon: InsidePolygonTariffs
    outside_polygon: OutsidePolygonTariffs


DEFAULT_OUTSIDE_BRACKETS: tuple[OutsideTariffBracket, ...] = (
    OutsideTariffBracket(0, 3, 4500, 0, 4500, 6500, 9500),
    OutsideTariffBracket(3.1, 4, 5500, 0, 5500, 7500, 10500),
    OutsideTariffBracket(4.1, 5, 6500, 0, 6500, 8500, 11500),
    OutsideTariffBracket(5.1, 6, 7500, 0, 7500, 9500, 12500),
    OutsideTariffBracket(6.1, 7, 8500, 0, 8500, 10500, 13500),
    OutsideTariffBracket(7.1, 8, 9500, 0, 9500, 11500, 14500),
    OutsideTariffBracket(8.1, 9, 10500, 0, 10500, 12500, 15500),
    OutsideTariffBracket(9.1, 10, 11500, 0, 11500, 13500, 16500),
    OutsideTariffBracket(10.1, 11, 12500, 3500, 16000, 20000, 24000),
    OutsideTariffBracket(11.1, 12, 13500, 4500, 18000, 22000, 26000),
    OutsideTariffBracket(12.1, 13, 14500, 5500, 20000, 24000, 28000),
    OutsideTariffBracket(13.1, 14, 15500, 6500, 22000, 26000, 30000),
    OutsideTariffBracket(14.1, 15, 16500, 7500, 24000, 28000, 32000),
    OutsideTariffBracket(15.1, 16, 17500, 8500, 26000, 30000, 34000),
    OutsideTariffBracket(16.1, 17, 18500, 9500, 28000, 32000, 36000),
    OutsideTariffBracket(17.1, 18, 19500, 10500, 30000, 34000, 38000),
    OutsideTariffBracket(18.1, 19, 20500, 11500, 32000, 36000, 40000),
    OutsideTariffBracket(19.1, 20, 21500, 12500, 34000, 38000, 42000),
)


def default_pricing_config() -> DeliveryPricingConfig:
    return DeliveryPricingConfig(
        inside_polygon=InsidePolygonTariffs(day_cents=3500, night_cents=5000),
        outside_polygon=OutsidePolygonTariffs(
            max_distance_km=20,
            brackets=DEFAULT_OUTSIDE_BRACKETS,
        ),
    )


def config_to_json(config: DeliveryPricingConfig) -> dict[str, object]:
    return {
        "inside_polygon": {
            "day_cents": config.inside_polygon.day_cents,
            "night_cents": config.inside_polygon.night_cents,
        },
        "outside_polygon": {
            "max_distance_km": config.outside_polygon.max_distance_km,
            "brackets": [
                {
                    "min_km": bracket.min_km,
                    "max_km": bracket.max_km,
                    "repa_cents": bracket.repa_cents,
                    "mexy_cents": bracket.mexy_cents,
                    "restaurant_cents": bracket.restaurant_cents,
                    "rain_light_cents": bracket.rain_light_cents,
                    "rain_heavy_cents": bracket.rain_heavy_cents,
                }
                for bracket in config.outside_polygon.brackets
            ],
        },
    }


def config_from_json(data: dict[str, object]) -> DeliveryPricingConfig:
    inside = data["inside_polygon"]
    if not isinstance(inside, dict):
        raise ValueError("inside_polygon inválido")

    outside = data["outside_polygon"]
    if not isinstance(outside, dict):
        raise ValueError("outside_polygon inválido")

    raw_brackets = outside.get("brackets")
    if not isinstance(raw_brackets, list):
        raise ValueError("brackets inválidos")

    brackets: list[OutsideTariffBracket] = []
    for row in raw_brackets:
        if not isinstance(row, dict):
            raise ValueError("bracket inválido")
        brackets.append(
            OutsideTariffBracket(
                min_km=float(row["min_km"]),
                max_km=float(row["max_km"]),
                repa_cents=int(row["repa_cents"]),
                mexy_cents=int(row["mexy_cents"]),
                restaurant_cents=int(row["restaurant_cents"]),
                rain_light_cents=int(row["rain_light_cents"]),
                rain_heavy_cents=int(row["rain_heavy_cents"]),
            )
        )

    return DeliveryPricingConfig(
        inside_polygon=InsidePolygonTariffs(
            day_cents=int(inside["day_cents"]),
            night_cents=int(inside["night_cents"]),
        ),
        outside_polygon=OutsidePolygonTariffs(
            max_distance_km=float(outside.get("max_distance_km", 20)),
            brackets=tuple(brackets),
        ),
    )


def find_outside_bracket(
    config: DeliveryPricingConfig, distance_km: float
) -> OutsideTariffBracket | None:
    if distance_km < 0:
        return None
    if distance_km > config.outside_polygon.max_distance_km:
        return None

    brackets = config.outside_polygon.brackets
    if not brackets:
        return None

    matches = [
        bracket
        for bracket in brackets
        if bracket.min_km <= distance_km <= bracket.max_km
    ]
    if matches:
        return min(matches, key=lambda bracket: bracket.max_km - bracket.min_km)

    # Hueco entre tramos (ej. 3.05 km entre 0–3 y 3.1–4): usar el siguiente tramo.
    next_brackets = [bracket for bracket in brackets if bracket.min_km > distance_km]
    if next_brackets:
        return min(next_brackets, key=lambda bracket: bracket.min_km)

    covering = [bracket for bracket in brackets if distance_km <= bracket.max_km]
    if covering:
        return min(covering, key=lambda bracket: bracket.max_km)

    return None


@dataclass(frozen=True)
class PricingQuote:
    available: bool
    reason: str | None
    total_cents: int
    repa_cents: int
    mexy_cents: int
    restaurant_cents: int
    inside_polygon: bool
    distance_km: float | None
    weather_mode: DeliveryWeatherMode
    is_night: bool


def quote_delivery_fee(
    config: DeliveryPricingConfig,
    *,
    inside_polygon: bool,
    distance_km: float | None,
    is_night: bool,
    weather_mode: DeliveryWeatherMode,
) -> PricingQuote:
    if weather_mode == "intense":
        return PricingQuote(
            available=False,
            reason="Servicio suspendido por lluvia intensa",
            total_cents=0,
            repa_cents=0,
            mexy_cents=0,
            restaurant_cents=0,
            inside_polygon=inside_polygon,
            distance_km=distance_km,
            weather_mode=weather_mode,
            is_night=is_night,
        )

    if inside_polygon:
        total = config.inside_polygon.night_cents if is_night else config.inside_polygon.day_cents
        return PricingQuote(
            available=True,
            reason=None,
            total_cents=total,
            repa_cents=total,
            mexy_cents=0,
            restaurant_cents=total,
            inside_polygon=True,
            distance_km=distance_km,
            weather_mode=weather_mode,
            is_night=is_night,
        )

    if distance_km is None:
        return PricingQuote(
            available=False,
            reason="Se requiere distancia de ruta para entregas fuera de cobertura",
            total_cents=0,
            repa_cents=0,
            mexy_cents=0,
            restaurant_cents=0,
            inside_polygon=False,
            distance_km=None,
            weather_mode=weather_mode,
            is_night=is_night,
        )

    bracket = find_outside_bracket(config, distance_km)
    if bracket is None:
        return PricingQuote(
            available=False,
            reason=f"Distancia fuera de cobertura de reparto (máx. {config.outside_polygon.max_distance_km:g} km)",
            total_cents=0,
            repa_cents=0,
            mexy_cents=0,
            restaurant_cents=0,
            inside_polygon=False,
            distance_km=distance_km,
            weather_mode=weather_mode,
            is_night=is_night,
        )

    if weather_mode == "light":
        total = bracket.rain_light_cents
        repa = total
        mexy = 0
    elif weather_mode == "heavy":
        total = bracket.rain_heavy_cents
        repa = total
        mexy = 0
    else:
        total = bracket.restaurant_cents
        repa = bracket.repa_cents
        mexy = bracket.mexy_cents

    return PricingQuote(
        available=True,
        reason=None,
        total_cents=total,
        repa_cents=repa,
        mexy_cents=mexy,
        restaurant_cents=total,
        inside_polygon=False,
        distance_km=distance_km,
        weather_mode=weather_mode,
        is_night=is_night,
    )


def validate_pricing_config(config: DeliveryPricingConfig) -> None:
    if config.inside_polygon.day_cents < 0 or config.inside_polygon.night_cents < 0:
        raise ValueError("Las tarifas dentro de cobertura no pueden ser negativas")

    if config.outside_polygon.max_distance_km <= 0:
        raise ValueError("La distancia máxima debe ser mayor a cero")

    if not config.outside_polygon.brackets:
        raise ValueError("Agrega al menos un tramo de distancia fuera de cobertura")

    max_bracket_km = 0.0
    for index, bracket in enumerate(config.outside_polygon.brackets, start=1):
        if bracket.min_km < 0 or bracket.max_km <= bracket.min_km:
            raise ValueError(f"Tramo {index}: el rango de km debe ser válido (mín < máx)")
        if bracket.max_km > max_bracket_km:
            max_bracket_km = bracket.max_km
        if any(
            value < 0
            for value in (
                bracket.repa_cents,
                bracket.mexy_cents,
                bracket.restaurant_cents,
                bracket.rain_light_cents,
                bracket.rain_heavy_cents,
            )
        ):
            raise ValueError(f"Tramo {index}: las tarifas no pueden ser negativas")

    if max_bracket_km > config.outside_polygon.max_distance_km:
        raise ValueError(
            "La distancia máxima debe ser al menos igual al km final del último tramo"
        )
