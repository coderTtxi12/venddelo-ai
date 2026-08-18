from __future__ import annotations

from typing import Any

from app.modules.delivery_dispatch.geo import geodesic_meters


def group_offer_totals(members: list[dict[str, Any]]) -> dict[str, Any]:
    package_count = sum(int(row.get("package_count") or 1) for row in members)
    collect_cents = sum(
        int(row.get("collect_cents") or 0)
        for row in members
        if row.get("payment_method") == "cash"
    )
    unique = {str(row.get("payment_method") or "") for row in members}
    unique.discard("")
    if len(unique) == 1:
        payment_method = next(iter(unique))
    elif unique:
        payment_method = "mixed"
    else:
        payment_method = "cash"
    return {
        "package_count": package_count,
        "collect_cents": collect_cents,
        "payment_method": payment_method,
    }


def order_offer_stops(
    stops: list[dict[str, Any]],
    start_lat: float | None,
    start_lng: float | None,
) -> list[dict[str, Any]]:
    if not stops:
        return []
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for stop in stops:
        groups.setdefault(_restaurant_key(stop), []).append(stop)

    remaining_keys = list(groups)
    lat, lng = start_lat, start_lng
    if lat is None or lng is None:
        first = stops[0]
        lat = first.get("restaurant_lat")
        lng = first.get("restaurant_lng")

    ordered: list[dict[str, Any]] = []
    while remaining_keys:
        key_index = _nearest_group_index(remaining_keys, groups, lat, lng)
        key = remaining_keys.pop(key_index)
        members = groups[key]
        restaurant_lat = members[0].get("restaurant_lat")
        restaurant_lng = members[0].get("restaurant_lng")
        ordered.extend(_order_by_dropoff(members, restaurant_lat, restaurant_lng))
        lat, lng = restaurant_lat, restaurant_lng
    return ordered


def _restaurant_key(stop: dict[str, Any]) -> tuple[Any, ...]:
    lat = stop.get("restaurant_lat")
    lng = stop.get("restaurant_lng")
    if lat is None or lng is None:
        return (stop.get("restaurant_name") or "",)
    return (round(float(lat), 5), round(float(lng), 5))


def _nearest_group_index(
    keys: list[tuple[Any, ...]],
    groups: dict[tuple[Any, ...], list[dict[str, Any]]],
    lat: float | None,
    lng: float | None,
) -> int:
    if lat is None or lng is None:
        return 0
    best = 0
    best_distance = float("inf")
    for index, key in enumerate(keys):
        stop = groups[key][0]
        restaurant_lat = stop.get("restaurant_lat")
        restaurant_lng = stop.get("restaurant_lng")
        if restaurant_lat is None or restaurant_lng is None:
            continue
        distance = geodesic_meters(lat, lng, restaurant_lat, restaurant_lng)
        if distance < best_distance:
            best = index
            best_distance = distance
    return best


def _order_by_dropoff(
    stops: list[dict[str, Any]],
    start_lat: float | None,
    start_lng: float | None,
) -> list[dict[str, Any]]:
    remaining = list(stops)
    lat, lng = start_lat, start_lng
    ordered: list[dict[str, Any]] = []
    while remaining:
        index = 0
        best = float("inf")
        if lat is not None and lng is not None:
            for i, stop in enumerate(remaining):
                drop_lat = stop.get("dropoff_lat")
                drop_lng = stop.get("dropoff_lng")
                if drop_lat is None or drop_lng is None:
                    continue
                distance = geodesic_meters(lat, lng, drop_lat, drop_lng)
                if distance < best:
                    best = distance
                    index = i
        chosen = remaining.pop(index)
        ordered.append(chosen)
        drop_lat = chosen.get("dropoff_lat")
        drop_lng = chosen.get("dropoff_lng")
        if drop_lat is not None and drop_lng is not None:
            lat, lng = drop_lat, drop_lng
    return ordered
