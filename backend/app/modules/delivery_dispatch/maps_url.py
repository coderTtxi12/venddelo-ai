from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_AT_COORDINATES = re.compile(r"/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
_DATA_COORDINATES = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")


def _valid_coordinates(latitude: float, longitude: float) -> bool:
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def parse_maps_url(url: str) -> tuple[float, float] | None:
    """Extract coordinates from common Google Maps URL formats without network I/O."""
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return None

    for pattern in (_AT_COORDINATES, _DATA_COORDINATES):
        match = pattern.search(parsed.path) or pattern.search(parsed.query) or pattern.search(
            parsed.fragment
        )
        if match:
            latitude, longitude = float(match.group(1)), float(match.group(2))
            return (latitude, longitude) if _valid_coordinates(latitude, longitude) else None

    ll_values = parse_qs(parsed.query).get("ll")
    if ll_values:
        parts = ll_values[0].split(",", maxsplit=1)
        if len(parts) == 2:
            try:
                latitude, longitude = float(parts[0]), float(parts[1])
            except ValueError:
                return None
            if _valid_coordinates(latitude, longitude):
                return latitude, longitude

    return None
