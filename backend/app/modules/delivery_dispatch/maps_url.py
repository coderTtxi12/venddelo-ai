from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.error import URLError
from urllib.parse import parse_qs, unquote_plus, urlencode, urlparse
from urllib.request import Request, urlopen

_AT_COORDINATES = re.compile(r"/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
_DATA_COORDINATES = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
_ALT_DATA_COORDINATES = re.compile(r"!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)")
_Q_COORDINATES = re.compile(r"^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$")
_SEARCH_PATH_COORDINATES = re.compile(r"/search/([^/?#]+),([^/?#]+)")
_PLACE_PATH = re.compile(r"/maps/place/([^/@]+)", re.IGNORECASE)
_PLACE_ID = re.compile(r"(?:place_id[=:]|query_place_id=|!1s)(ChIJ[\w-]+)")
_FEATURE_CID = re.compile(r"(?:!1s|1s)0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)", re.IGNORECASE)
_PASTED_COORDINATES = re.compile(
    r"""
    ^\s*
    (?:(?:lat(?:itud(?:e)?)?)\s*[:=]\s*)?
    (?P<lat>-?\d+(?:\.\d+)?)\s*°?\s*(?P<lat_hem>[NSns])?
    \s*[,;\s]\s*
    (?:(?:lng|lon(?:gitud(?:e)?)?)\s*[:=]\s*)?
    (?P<lng>-?\d+(?:\.\d+)?)\s*°?\s*(?P<lng_hem>[EWew])?
    \s*$
    """,
    re.VERBOSE | re.IGNORECASE,
)
_BIAS_DELTA = 0.015


@dataclass(frozen=True)
class MapsResolveResult:
    latitude: float
    longitude: float
    address: str | None = None
    resolved_url: str | None = None


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


def _first_pattern_coords(text: str, pattern: re.Pattern[str]) -> tuple[float, float] | None:
    matches = list(pattern.finditer(text))
    for match in reversed(matches):
        pair = _coords_from_pair(match.group(1), match.group(2))
        if pair:
            return pair
    return None


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


def extract_maps_camera_coordinates(url: str) -> tuple[float, float] | None:
    """Map camera center from /@lat,lng — not the dropped pin."""
    trimmed = url.strip()
    if not trimmed:
        return None
    pair = _first_pattern_coords(trimmed, _AT_COORDINATES)
    if pair:
        return pair
    try:
        parsed = urlparse(trimmed)
    except ValueError:
        return None
    haystack = f"{parsed.path}?{parsed.query}#{parsed.fragment}"
    return _first_pattern_coords(haystack, _AT_COORDINATES)


def _parse_query_coordinates(url: str) -> tuple[float, float] | None:
    trimmed = url.strip()
    if not trimmed:
        return None

    search_match = _SEARCH_PATH_COORDINATES.search(trimmed)
    if search_match:
        pair = _coords_from_pair(search_match.group(1), search_match.group(2))
        if pair:
            return pair

    try:
        parsed = urlparse(trimmed)
    except ValueError:
        return None

    search_path_match = _SEARCH_PATH_COORDINATES.search(parsed.path)
    if search_path_match:
        pair = _coords_from_pair(search_path_match.group(1), search_path_match.group(2))
        if pair:
            return pair

    query_params = parse_qs(parsed.query)
    ll_values = query_params.get("ll")
    if ll_values:
        parts = ll_values[0].split(",", maxsplit=1)
        if len(parts) == 2:
            try:
                latitude, longitude = float(parts[0]), float(parts[1])
            except ValueError:
                latitude = longitude = None
            if latitude is not None and longitude is not None and _valid_coordinates(latitude, longitude):
                return latitude, longitude

    for key in ("q", "query", "destination"):
        values = query_params.get(key)
        if not values:
            continue
        q_match = _Q_COORDINATES.match(values[0].strip())
        if q_match:
            pair = _coords_from_pair(q_match.group(1), q_match.group(2))
            if pair:
                return pair

    return None


def parse_maps_pin_coordinates(url: str) -> tuple[float, float] | None:
    """Pin or explicit destination coords — never the camera center."""
    trimmed = url.strip()
    if not trimmed:
        return None

    pin = _first_pattern_coords(trimmed, _DATA_COORDINATES)
    if pin:
        return pin

    query_coords = _parse_query_coordinates(trimmed)
    if query_coords:
        return query_coords

    alt = _first_pattern_coords(trimmed, _ALT_DATA_COORDINATES)
    if alt:
        return alt

    try:
        parsed = urlparse(trimmed)
    except ValueError:
        return None
    haystack = f"{parsed.path}?{parsed.query}#{parsed.fragment}"
    return _first_pattern_coords(haystack, _DATA_COORDINATES) or _first_pattern_coords(
        haystack,
        _ALT_DATA_COORDINATES,
    )


def parse_pasted_coordinates(text: str) -> tuple[float, float] | None:
    """Parse a pasted lat/lng pair. Rejects Maps URLs and street addresses."""
    trimmed = text.strip()
    if not trimmed or "://" in trimmed or should_follow_maps_redirect(trimmed):
        return None
    match = _PASTED_COORDINATES.match(trimmed)
    if not match:
        return None
    try:
        latitude = float(match.group("lat"))
        longitude = float(match.group("lng"))
    except ValueError:
        return None
    lat_hem = (match.group("lat_hem") or "").upper()
    lng_hem = (match.group("lng_hem") or "").upper()
    if lat_hem == "S":
        latitude = -abs(latitude)
    elif lat_hem == "N":
        latitude = abs(latitude)
    if lng_hem == "W":
        longitude = -abs(longitude)
    elif lng_hem == "E":
        longitude = abs(longitude)
    if not _valid_coordinates(latitude, longitude):
        return None
    return latitude, longitude


def parse_maps_url(url: str) -> tuple[float, float] | None:
    """Extract coordinates from common Google Maps URL formats without network I/O."""
    pasted = parse_pasted_coordinates(url)
    if pasted:
        return pasted
    pin = parse_maps_pin_coordinates(url)
    if pin:
        return pin
    return extract_maps_camera_coordinates(url)


def _usable_geocode_text(raw: str | None) -> str | None:
    if not raw:
        return None
    text = raw.strip()
    if not text or _Q_COORDINATES.match(text):
        return None
    if text.lower().startswith("place_id:"):
        return None
    return text


def extract_maps_query_text(url: str) -> str | None:
    """Best-effort address/place text for geocoding when the URL has no lat/lng."""
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return None

    query_params = parse_qs(parsed.query)
    for key in ("q", "query", "destination"):
        values = query_params.get(key)
        if not values:
            continue
        text = _usable_geocode_text(values[0])
        if text:
            return text

    place_match = _PLACE_PATH.search(parsed.path)
    if place_match:
        text = _usable_geocode_text(unquote_plus(place_match.group(1)))
        if text:
            return text

    return None


def extract_maps_place_id(url: str) -> str | None:
    match = _PLACE_ID.search(url.strip())
    if match:
        return match.group(1)
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return None
    for key in ("query_place_id", "place_id"):
        values = parse_qs(parsed.query).get(key)
        if values and values[0].startswith("ChIJ"):
            return values[0].strip()
    return None


def extract_maps_cid(url: str) -> int | None:
    match = _FEATURE_CID.search(url.strip())
    if not match:
        return None
    try:
        return int(match.group(1), 16)
    except ValueError:
        return None


def _google_json(url: str) -> dict | None:
    request = Request(
        url,
        headers={"User-Agent": "MexyDispatch/1.0"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def _coords_and_address_from_location(
    location: object,
    formatted_address: object = None,
) -> tuple[float, float, str | None] | None:
    if not isinstance(location, dict):
        return None
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
    address = formatted_address.strip() if isinstance(formatted_address, str) and formatted_address.strip() else None
    return lat_f, lng_f, address


def _geocode_payload_result(payload: dict) -> tuple[float, float, str | None] | None:
    if payload.get("status") != "OK":
        return None
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return None
    first = results[0]
    if not isinstance(first, dict):
        return None
    return _coords_and_address_from_location(
        first.get("geometry", {}).get("location", {}),
        first.get("formatted_address"),
    )


def geocode_place_id(place_id: str, api_key: str) -> tuple[float, float, str | None] | None:
    params = urlencode({"place_id": place_id, "key": api_key, "language": "es"})
    payload = _google_json(f"https://maps.googleapis.com/maps/api/geocode/json?{params}")
    if payload is None:
        return None
    return _geocode_payload_result(payload)


def geocode_place_cid(cid: int, api_key: str) -> tuple[float, float, str | None] | None:
    params = urlencode(
        {
            "cid": str(cid),
            "fields": "geometry,formatted_address,name",
            "key": api_key,
            "language": "es",
        }
    )
    payload = _google_json(f"https://maps.googleapis.com/maps/api/place/details/json?{params}")
    if payload is None or payload.get("status") != "OK":
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    parsed = _coords_and_address_from_location(
        result.get("geometry", {}).get("location", {}),
        result.get("formatted_address") or result.get("name"),
    )
    return parsed


def geocode_address_text(
    address: str,
    api_key: str,
    bias: tuple[float, float] | None = None,
) -> tuple[float, float, str | None] | None:
    params: dict[str, str] = {"address": address, "key": api_key, "region": "mx", "language": "es"}
    if bias is not None:
        lat, lng = bias
        params["bounds"] = (
            f"{lat - _BIAS_DELTA},{lng - _BIAS_DELTA}|{lat + _BIAS_DELTA},{lng + _BIAS_DELTA}"
        )
    payload = _google_json(f"https://maps.googleapis.com/maps/api/geocode/json?{urlencode(params)}")
    if payload is None:
        return None
    return _geocode_payload_result(payload)


def resolve_maps_coordinates(
    url: str,
    api_key: str | None = None,
    resolved_url: str | None = None,
) -> MapsResolveResult | None:
    """Resolve a Maps URL to the shared pin, then place id, then name+camera, then camera."""
    candidates = [item for item in (resolved_url, url) if item and item.strip()]
    seen: set[str] = set()
    unique: list[str] = []
    for candidate in candidates:
        trimmed = candidate.strip()
        if trimmed in seen:
            continue
        seen.add(trimmed)
        unique.append(trimmed)
    if not unique:
        return None

    for candidate in unique:
        pasted = parse_pasted_coordinates(candidate)
        if pasted:
            return MapsResolveResult(latitude=pasted[0], longitude=pasted[1])

    for candidate in unique:
        pin = parse_maps_pin_coordinates(candidate)
        if pin:
            return MapsResolveResult(
                latitude=pin[0],
                longitude=pin[1],
                address=extract_maps_query_text(candidate),
            )

    if api_key:
        for candidate in unique:
            place_id = extract_maps_place_id(candidate)
            if not place_id:
                continue
            geocoded = geocode_place_id(place_id, api_key)
            if geocoded:
                return MapsResolveResult(
                    latitude=geocoded[0],
                    longitude=geocoded[1],
                    address=geocoded[2] or extract_maps_query_text(candidate),
                )

        for candidate in unique:
            cid = extract_maps_cid(candidate)
            if cid is None:
                continue
            geocoded = geocode_place_cid(cid, api_key)
            if geocoded:
                return MapsResolveResult(
                    latitude=geocoded[0],
                    longitude=geocoded[1],
                    address=geocoded[2] or extract_maps_query_text(candidate),
                )

        for candidate in unique:
            query_text = extract_maps_query_text(candidate)
            if not query_text:
                continue
            camera = extract_maps_camera_coordinates(candidate)
            geocoded = geocode_address_text(query_text, api_key, bias=camera)
            if geocoded:
                return MapsResolveResult(
                    latitude=geocoded[0],
                    longitude=geocoded[1],
                    address=geocoded[2] or query_text,
                )

    for candidate in unique:
        camera = extract_maps_camera_coordinates(candidate)
        if camera:
            return MapsResolveResult(
                latitude=camera[0],
                longitude=camera[1],
                address=extract_maps_query_text(candidate),
            )

    return None
