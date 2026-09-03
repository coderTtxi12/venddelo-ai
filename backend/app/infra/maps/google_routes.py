from __future__ import annotations

import json
import urllib.error
import urllib.request


class RoutesError(Exception):
    pass


COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = "routes.distanceMeters,routes.routeLabels,routes.routeToken"


def shortest_route_meters(routes: list[object]) -> int:
    labeled: list[int] = []
    distances: list[int] = []
    for route in routes:
        if not isinstance(route, dict):
            continue
        meters = route.get("distanceMeters")
        if not isinstance(meters, (int, float)) or meters < 0:
            continue
        value = int(meters)
        distances.append(value)
        labels = route.get("routeLabels")
        if isinstance(labels, list) and "SHORTER_DISTANCE" in labels:
            labeled.append(value)
    if labeled:
        return min(labeled)
    if distances:
        return min(distances)
    raise RoutesError("No hay ruta disponible hacia esta dirección")


def fetch_driving_distance_km(
    *,
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
    api_key: str,
) -> float:
    body = {
        "origin": {
            "location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": destination_lat,
                    "longitude": destination_lng,
                }
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
        "requestedReferenceRoutes": ["SHORTER_DISTANCE"],
        "languageCode": "es-MX",
        "units": "METRIC",
    }
    request = urllib.request.Request(
        COMPUTE_ROUTES_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RoutesError("No se pudo calcular la distancia de entrega") from exc

    if not isinstance(payload, dict):
        raise RoutesError("Respuesta de Routes inválida")

    if isinstance(payload.get("error"), dict):
        raise RoutesError("No se pudo calcular la ruta hacia esta dirección")

    routes = payload.get("routes")
    if not isinstance(routes, list):
        raise RoutesError("Respuesta de Routes inválida")

    meters = shortest_route_meters(routes)
    return round(float(meters) / 1000, 2)
