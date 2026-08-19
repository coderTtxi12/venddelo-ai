from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models.delivery import (
    DeliveryDispatchRequest,
    DeliveryDriverItineraryStop,
)
from app.db.models.restaurant import Restaurant
from app.modules.delivery_dispatch.geo import geodesic_meters
from app.modules.delivery_dispatch.schemas import DriverItineraryStopDTO


@dataclass(frozen=True)
class ItineraryJob:
    request_id: str
    status: str
    restaurant_lat: float | None
    restaurant_lng: float | None
    dropoff_lat: float
    dropoff_lng: float


@dataclass(frozen=True)
class ItineraryStop:
    kind: str
    request_id: str


def remaining_stops(jobs: list[ItineraryJob]) -> list[ItineraryStop]:
    stops: list[ItineraryStop] = []
    for job in jobs:
        if job.status == "assigned":
            stops.append(ItineraryStop(kind="restaurant", request_id=job.request_id))
        if job.status in {"assigned", "picked_up", "in_transit"}:
            stops.append(ItineraryStop(kind="dropoff", request_id=job.request_id))
    return stops


def pickup_before_dropoff(stops: list[ItineraryStop]) -> bool:
    pickup_at: dict[str, int] = {}
    dropoff_at: dict[str, int] = {}
    for index, stop in enumerate(stops):
        if stop.kind == "restaurant":
            pickup_at[stop.request_id] = index
        else:
            dropoff_at[stop.request_id] = index
    return all(
        pickup_at[request_id] < index
        for request_id, index in dropoff_at.items()
        if request_id in pickup_at
    )


def plan_itinerary(
    jobs: list[ItineraryJob],
    *,
    case: str,
    rider_lat: float | None,
    rider_lng: float | None,
    pre_free: bool = False,
    previous: list[ItineraryStop] | None = None,
    new_request_ids: set[str] | None = None,
    manual: list[ItineraryStop] | None = None,
) -> list[ItineraryStop]:
    pending = remaining_stops(jobs)
    pending_set = set(pending)
    if manual is not None:
        kept = [stop for stop in manual if stop in pending_set]
        extra = [stop for stop in pending if stop not in set(kept)]
        candidate = [*kept, *extra]
        if pickup_before_dropoff(candidate):
            return candidate

    by_id = {job.request_id: job for job in jobs}
    new_ids = new_request_ids or set()

    if case == "M":
        kept = [stop for stop in (previous or []) if stop in pending_set]
        extra = [stop for stop in pending if stop not in set(kept)]
        return [*kept, *extra]

    if case == "D":
        return _plan_case_d(pending, previous or [], new_ids)

    if case == "C":
        return _plan_case_c(pending, previous or [], new_ids)

    if pre_free:
        current = [
            stop
            for stop in pending
            if by_id[stop.request_id].status in {"picked_up", "in_transit"}
        ]
        incoming = [stop for stop in pending if by_id[stop.request_id].status == "assigned"]
        return [*current, *incoming]

    if len(jobs) == 1:
        return pending
    return _plan_nn(jobs, pending, rider_lat, rider_lng)


def _plan_case_d(
    pending: list[ItineraryStop],
    previous: list[ItineraryStop],
    new_ids: set[str],
) -> list[ItineraryStop]:
    pending_set = set(pending)
    new_pickups = [
        stop for stop in pending if stop.kind == "restaurant" and stop.request_id in new_ids
    ]
    new_dropoffs = [
        stop for stop in pending if stop.kind == "dropoff" and stop.request_id in new_ids
    ]
    kept = [
        stop
        for stop in previous
        if stop in pending_set and stop.request_id not in new_ids
    ]
    leftover = [
        stop
        for stop in pending
        if stop not in set(new_pickups + kept + new_dropoffs)
    ]
    return [*new_pickups, *kept, *leftover, *new_dropoffs]


def _plan_case_c(
    pending: list[ItineraryStop],
    previous: list[ItineraryStop],
    new_ids: set[str],
) -> list[ItineraryStop]:
    pending_set = set(pending)
    new_pickups = [
        stop for stop in pending if stop.kind == "restaurant" and stop.request_id in new_ids
    ]
    new_dropoffs = [
        stop for stop in pending if stop.kind == "dropoff" and stop.request_id in new_ids
    ]
    kept = [
        stop
        for stop in previous
        if stop in pending_set and stop.request_id not in new_ids
    ]
    leftover = [
        stop
        for stop in pending
        if stop not in set(new_pickups + kept + new_dropoffs)
    ]
    kept_pickups = [stop for stop in kept if stop.kind == "restaurant"]
    leftover_pickups = [stop for stop in leftover if stop.kind == "restaurant"]
    kept_dropoffs = [stop for stop in kept if stop.kind == "dropoff"]
    leftover_dropoffs = [stop for stop in leftover if stop.kind == "dropoff"]
    return [
        *kept_pickups,
        *leftover_pickups,
        *new_pickups,
        *kept_dropoffs,
        *leftover_dropoffs,
        *new_dropoffs,
    ]


def _plan_nn(
    jobs: list[ItineraryJob],
    pending: list[ItineraryStop],
    rider_lat: float | None,
    rider_lng: float | None,
) -> list[ItineraryStop]:
    by_id = {job.request_id: job for job in jobs}
    pickups = [stop for stop in pending if stop.kind == "restaurant"]
    dropoffs = [stop for stop in pending if stop.kind == "dropoff"]

    def pickup_point(stop: ItineraryStop) -> tuple[float, float] | None:
        job = by_id[stop.request_id]
        if job.restaurant_lat is None or job.restaurant_lng is None:
            return None
        return job.restaurant_lat, job.restaurant_lng

    def dropoff_point(stop: ItineraryStop) -> tuple[float, float] | None:
        job = by_id[stop.request_id]
        return job.dropoff_lat, job.dropoff_lng

    ordered_pickups = _nearest_neighbor(pickups, pickup_point, rider_lat, rider_lng)
    lat, lng = rider_lat, rider_lng
    if ordered_pickups:
        last = pickup_point(ordered_pickups[-1])
        if last is not None:
            lat, lng = last
    ordered_dropoffs = _nearest_neighbor(dropoffs, dropoff_point, lat, lng)
    return [*ordered_pickups, *ordered_dropoffs]


def _nearest_neighbor(
    items: list[ItineraryStop],
    point_of,
    start_lat: float | None,
    start_lng: float | None,
) -> list[ItineraryStop]:
    if len(items) <= 1:
        return list(items)
    remaining = list(items)
    ordered: list[ItineraryStop] = []
    lat, lng = start_lat, start_lng
    while remaining:
        index = 0
        best = float("inf")
        if lat is not None and lng is not None:
            for i, item in enumerate(remaining):
                point = point_of(item)
                if point is None:
                    continue
                distance = geodesic_meters(lat, lng, point[0], point[1])
                if distance < best:
                    best = distance
                    index = i
        chosen = remaining.pop(index)
        ordered.append(chosen)
        point = point_of(chosen)
        if point is not None:
            lat, lng = point
    return ordered


_ACTIVE_JOBS = frozenset({"assigned", "picked_up", "in_transit"})


def load_plan(session: Session, driver_id: uuid.UUID) -> list[ItineraryStop]:
    rows = session.scalars(
        select(DeliveryDriverItineraryStop)
        .where(DeliveryDriverItineraryStop.driver_id == driver_id)
        .order_by(DeliveryDriverItineraryStop.sequence.asc())
    ).all()
    return [ItineraryStop(kind=row.kind, request_id=str(row.request_id)) for row in rows]


def hydrate_itinerary(
    session: Session,
    driver_id: uuid.UUID,
) -> list[DriverItineraryStopDTO]:
    rows = session.scalars(
        select(DeliveryDriverItineraryStop)
        .where(DeliveryDriverItineraryStop.driver_id == driver_id)
        .order_by(DeliveryDriverItineraryStop.sequence.asc())
    ).all()
    if not rows:
        jobs = jobs_for_driver(session, driver_id)
        if jobs:
            replace_plan(session, driver_id, remaining_stops(jobs))
            session.flush()
            rows = session.scalars(
                select(DeliveryDriverItineraryStop)
                .where(DeliveryDriverItineraryStop.driver_id == driver_id)
                .order_by(DeliveryDriverItineraryStop.sequence.asc())
            ).all()
    if not rows:
        return []
    request_ids = [row.request_id for row in rows]
    requests = {
        item.id: item
        for item in session.scalars(
            select(DeliveryDispatchRequest).where(DeliveryDispatchRequest.id.in_(request_ids))
        )
    }
    restaurants = {}
    restaurant_ids = {
        request.restaurant_id for request in requests.values()
    }
    if restaurant_ids:
        restaurants = {
            item.id: item
            for item in session.scalars(select(Restaurant).where(Restaurant.id.in_(restaurant_ids)))
        }
    dtos: list[DriverItineraryStopDTO] = []
    for row in rows:
        request = requests.get(row.request_id)
        restaurant = (
            restaurants.get(request.restaurant_id) if request is not None else None
        )
        if row.kind == "restaurant":
            title = restaurant.name if restaurant is not None else ""
            detail = request.short_id if request is not None else None
            lat = restaurant.latitude if restaurant is not None else None
            lng = restaurant.longitude if restaurant is not None else None
            action = "Recoger"
        else:
            title = ""
            detail = None
            lat = None
            lng = None
            if request is not None:
                title = request.customer_name or request.dropoff_address
                detail = request.dropoff_address
                lat = request.dropoff_lat
                lng = request.dropoff_lng
            action = "Entregar"
        dtos.append(
            DriverItineraryStopDTO(
                sequence=row.sequence,
                kind=row.kind,  # type: ignore[arg-type]
                request_id=row.request_id,
                current=row.sequence == 1,
                title=title,
                detail=detail,
                lat=lat,
                lng=lng,
                short_id=request.short_id if request is not None else None,
                action=action,
            )
        )
    return dtos


def replace_plan(session: Session, driver_id: uuid.UUID, stops: list[ItineraryStop]) -> None:
    session.execute(
        delete(DeliveryDriverItineraryStop).where(
            DeliveryDriverItineraryStop.driver_id == driver_id
        )
    )
    for index, stop in enumerate(stops, start=1):
        session.add(
            DeliveryDriverItineraryStop(
                driver_id=driver_id,
                request_id=uuid.UUID(stop.request_id),
                sequence=index,
                kind=stop.kind,
            )
        )


def jobs_for_driver(session: Session, driver_id: uuid.UUID) -> list[ItineraryJob]:
    rows = session.execute(
        select(DeliveryDispatchRequest, Restaurant)
        .join(Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id)
        .where(
            DeliveryDispatchRequest.assigned_driver_id == driver_id,
            DeliveryDispatchRequest.status.in_(tuple(_ACTIVE_JOBS)),
        )
    ).all()
    jobs: list[ItineraryJob] = []
    for request, restaurant in rows:
        jobs.append(
            ItineraryJob(
                request_id=str(request.id),
                status=request.status,
                restaurant_lat=restaurant.latitude if restaurant is not None else None,
                restaurant_lng=restaurant.longitude if restaurant is not None else None,
                dropoff_lat=request.dropoff_lat,
                dropoff_lng=request.dropoff_lng,
            )
        )
    return jobs


def rebuild_driver_itinerary(
    session: Session,
    driver_id: uuid.UUID,
    *,
    case: str,
    rider_lat: float | None,
    rider_lng: float | None,
    pre_free: bool = False,
    new_request_ids: set[str] | None = None,
    manual: list[ItineraryStop] | None = None,
) -> list[ItineraryStop]:
    session.flush()
    previous = load_plan(session, driver_id)
    jobs = jobs_for_driver(session, driver_id)
    stops = plan_itinerary(
        jobs,
        case=case,
        rider_lat=rider_lat,
        rider_lng=rider_lng,
        pre_free=pre_free,
        previous=previous,
        new_request_ids=new_request_ids,
        manual=manual,
    )
    replace_plan(session, driver_id, stops)
    return stops


def complete_stop(
    session: Session,
    driver_id: uuid.UUID,
    request_id: uuid.UUID,
    kind: str,
) -> None:
    remaining = [
        stop
        for stop in load_plan(session, driver_id)
        if not (stop.request_id == str(request_id) and stop.kind == kind)
    ]
    replace_plan(session, driver_id, remaining)


def remove_request_stops(
    session: Session,
    driver_id: uuid.UUID,
    request_id: uuid.UUID,
) -> None:
    remaining = [
        stop for stop in load_plan(session, driver_id) if stop.request_id != str(request_id)
    ]
    replace_plan(session, driver_id, remaining)


def parse_manual_stops(payload: list[dict] | None) -> list[ItineraryStop] | None:
    if not payload:
        return None
    stops: list[ItineraryStop] = []
    for row in payload:
        kind = str(row.get("kind") or "")
        request_id = str(row.get("request_id") or "")
        if kind not in {"restaurant", "dropoff"} or not request_id:
            continue
        stops.append(ItineraryStop(kind=kind, request_id=request_id))
    return stops or None
