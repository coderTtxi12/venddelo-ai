from __future__ import annotations

import json
import re
from urllib.error import URLError
from urllib.parse import parse_qs, unquote_plus, urlencode, urlparse
from urllib.request import Request, urlopen

_AT_COORDINATES = re.compile(r"/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
_DATA_COORDINATES = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
_ALT_DATA_COORDINATES = re.compile(r"!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)")
_Q_COORDINATES = re.compile(r"^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$")
_SEARCH_PATH_COORDINATES = re.compile(r"/search/([^/?#]+),([^/?#]+)")


def _parse_coord_fragment(raw: str) -> float | None:
    """Parse lat/lng tokens from Maps paths (e.g. search/19.63,+-99.10)."""
    token = raw.strip().replace("+", "")
    if not token:
        return None
    try:
        return float(token)
    except ValueError:
        return None


def _coords_from_pair(lat_raw: str, lng_raw: str) -> tuple[float, float] | None:
    latitude = _parse_coord_fragment(lat_raw)
    longitude = _parse_coord_fragment(lng_raw)
    if latitude is None or longitude is None:
        return None
    if not _valid_coordinates(latitude, longitude):
        return None
    return latitude, longitude


def _normalize_host(url: str) -> str | None:
    try:
        host = urlparse(url.strip()).hostname
    except ValueError:
        return None
    if not host:
        return None
    return host.lower().removeprefix("www.")


def should_follow_maps_redirect(url: str) -> bool:
    host = _normalize_host(url)
    if not host:
        return False
    return (
        "google" in host
        or host in {"goo.gl", "maps.app.goo.gl", "maps.google.com"}
    )


def _valid_coordinates(latitude: float, longitude: float) -> bool:
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def parse_maps_url(url: str) -> tuple[float, float] | None:
    """Extract coordinates from common Google Maps URL formats without network I/O."""
    trimmed = url.strip()
    if not trimmed:
        return None

    for pattern in (_AT_COORDINATES, _DATA_COORDINATES, _ALT_DATA_COORDINATES):
        match = pattern.search(trimmed)
        if match:
            pair = _coords_from_pair(match.group(1), match.group(2))
            if pair:
                return pair

    search_match = _SEARCH_PATH_COORDINATES.search(trimmed)
    if search_match:
        pair = _coords_from_pair(search_match.group(1), search_match.group(2))
        if pair:
            return pair

    try:
        parsed = urlparse(trimmed)
    except ValueError:
        return None

    for pattern in (_AT_COORDINATES, _DATA_COORDINATES, _ALT_DATA_COORDINATES):
        match = pattern.search(parsed.path) or pattern.search(parsed.query) or pattern.search(
            parsed.fragment
        )
        if match:
            pair = _coords_from_pair(match.group(1), match.group(2))
            if pair:
                return pair

    search_path_match = _SEARCH_PATH_COORDINATES.search(parsed.path)
    if search_path_match:
        pair = _coords_from_pair(search_path_match.group(1), search_path_match.group(2))
        if pair:
            return pair

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

    query_params = parse_qs(parsed.query)
    for key in ("q", "query", "destination", "origin", "center"):
        values = query_params.get(key)
        if not values:
            continue
        q_match = _Q_COORDINATES.match(values[0].strip())
        if q_match:
            pair = _coords_from_pair(q_match.group(1), q_match.group(2))
            if pair:
                return pair

    return None


def extract_maps_query_text(url: str) -> str | None:
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return None

    q_values = parse_qs(parsed.query).get("q")
    if not q_values:
        return None

    q_text = q_values[0].strip()
    if not q_text or _Q_COORDINATES.match(q_text):
        return None
    return q_text


def geocode_address_text(address: str, api_key: str) -> tuple[float, float] | None:
    params = urlencode({"address": address, "key": api_key, "region": "mx"})
    request = Request(
        f"https://maps.googleapis.com/maps/api/geocode/json?{params}",
        headers={"User-Agent": "MexyDispatch/1.0"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError):
        return None

    if payload.get("status") != "OK":
        return None

    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return None

    location = results[0].get("geometry", {}).get("location", {})
    latitude = location.get("lat")
    longitude = location.get("lng")
    if latitude is None or longitude is None:
        return None
    try:
        lat_f = float(latitude)
        lng_f = float(longitude)
    except (TypeError, ValueError):
        return None
    if not _valid_coordinates(lat_f, lng_f):
        return None
    return lat_f, lng_f
