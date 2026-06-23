from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


class DistanceMatrixError(Exception):
    pass


def fetch_driving_distance_km(
    *,
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
    api_key: str,
) -> float:
    params = urllib.parse.urlencode(
        {
            "origins": f"{origin_lat},{origin_lng}",
            "destinations": f"{destination_lat},{destination_lng}",
            "mode": "driving",
            "key": api_key,
        }
    )
    url = f"https://maps.googleapis.com/maps/api/distancematrix/json?{params}"

    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise DistanceMatrixError("No se pudo calcular la distancia de entrega") from exc

    status = payload.get("status")
    if status != "OK":
        raise DistanceMatrixError(f"Distance Matrix respondió con estado {status}")

    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        raise DistanceMatrixError("Respuesta de Distance Matrix inválida")

    elements = rows[0].get("elements")
    if not isinstance(elements, list) or not elements:
        raise DistanceMatrixError("Respuesta de Distance Matrix inválida")

    element = elements[0]
    if element.get("status") != "OK":
        raise DistanceMatrixError("No hay ruta disponible hacia esta dirección")

    distance = element.get("distance", {})
    meters = distance.get("value")
    if not isinstance(meters, (int, float)) or meters < 0:
        raise DistanceMatrixError("Distancia de ruta inválida")

    return round(float(meters) / 1000, 2)
