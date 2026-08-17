from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from uuid import uuid4

from app.modules.delivery_dispatch.geo import geodesic_meters

_OCCUPIED_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})
_ON_ROUTE_STATUSES = frozenset({"picked_up", "in_transit"})
_GROUPABLE_STATUSES = frozenset({"scheduled", "searching"})
CaseName = Literal["A", "B", "C", "D"]

_PICKUP_PROXIMITY_WEIGHT = 3
_DESTINATION_COMPAT_WEIGHT = 3
_DETOUR_WEIGHT = 2
_CAPACITY_WEIGHT = 2


@dataclass(frozen=True)
class EngineSettings:
    driver_location_staleness_seconds: int = 90
    min_protected_drivers: int = 2
    high_demand_available_drivers_max: int = 2
    high_demand_occupied_ratio: float = 0.80
    high_demand_pending_min: int = 5
    max_active_packages_per_driver: int = 3
    pre_free_eta_seconds: int = 60
    pre_free_speed_mps: float = 8.0
    near_destination_radius_meters: int = 800
    max_extra_route_minutes: int = 8
    max_pickup_detour_minutes: int = 8
    max_destination_detour_minutes: int = 8
    assignment_timeout_seconds: int = 900


@dataclass(frozen=True)
class EngineRequest:
    id: str
    restaurant_lat: float
    restaurant_lng: float
    package_size: str
    package_count: int
    payment_method: str
    collect_cents: int
    dropoff_lat: float
    dropoff_lng: float
    status: str = "searching"
    cycle_rejected_driver_ids: tuple[str, ...] = ()
    cycle_silent_driver_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class EngineDriver:
    id: str
    status: str
    is_online: bool
    last_lat: float | None
    last_lng: float | None
    location_updated_at: datetime | None
    credit_limit_cents: int
    credit_held_cents: int
    compartment_size: str
    active_request_status: str | None = None
    active_package_count: int = 0
    has_open_offer: bool = False
    active_dropoff_lat: float | None = None
    active_dropoff_lng: float | None = None
    occupied_job_count: int = 0


@dataclass(frozen=True)
class EngineContext:
    now: datetime
    settings: EngineSettings
    request: EngineRequest
    due_siblings: tuple[EngineRequest, ...]
    drivers: tuple[EngineDriver, ...]
    pending_count: int


@dataclass(frozen=True)
class EngineOffer:
    request_id: str
    driver_id: str
    case: CaseName
    group_id: str | None = None


@dataclass(frozen=True)
class EngineResult:
    case: CaseName | None
    offers: tuple[EngineOffer, ...]
    high_demand: bool
    group_id: str | None = None


def assignment_timed_out(now: datetime, search_at: datetime, timeout_seconds: int) -> bool:
    return now >= search_at + timedelta(seconds=timeout_seconds)


def choose_assignments(context: EngineContext) -> EngineResult:
    high_demand = _is_high_demand(context)
    due = _due_requests(context)

    if not high_demand:
        if len(due) > 1:
            offers = _assign_case_b(context, due)
            if offers:
                return EngineResult(case="B", offers=offers, high_demand=False)
            high_demand = True
        else:
            driver = _nearest_free(context, context.request, taken=set())
            if driver is None:
                return EngineResult(case=None, offers=(), high_demand=False)
            return EngineResult(
                case="A",
                offers=(EngineOffer(request_id=context.request.id, driver_id=driver.id, case="A"),),
                high_demand=False,
            )

    group = _nearby_dropoff_group(context, due)
    if len(group) >= 2:
        result = _assign_case_c(context, group)
        if result.offers:
            return result

    offers = _assign_case_d(context)
    if offers:
        return EngineResult(case="D", offers=offers, high_demand=True)
    return EngineResult(case=None, offers=(), high_demand=True)


def _due_requests(context: EngineContext) -> tuple[EngineRequest, ...]:
    seen: list[EngineRequest] = [context.request]
    ids = {context.request.id}
    for sibling in context.due_siblings:
        if sibling.id not in ids:
            seen.append(sibling)
            ids.add(sibling.id)
    return tuple(seen)


def _is_high_demand(context: EngineContext) -> bool:
    settings = context.settings
    free = [driver for driver in context.drivers if _is_free(context, context.request, driver)]
    if len(free) <= settings.high_demand_available_drivers_max:
        return True

    online_fresh = [driver for driver in context.drivers if _is_online_fresh(context, driver)]
    occupied = [
        driver
        for driver in online_fresh
        if driver.active_request_status in _OCCUPIED_STATUSES and not _is_pre_free(context, driver)
    ]
    if online_fresh and (len(occupied) / len(online_fresh)) >= settings.high_demand_occupied_ratio:
        return True

    return context.pending_count >= settings.high_demand_pending_min


def _assign_case_b(
    context: EngineContext,
    due: tuple[EngineRequest, ...],
) -> tuple[EngineOffer, ...]:
    free_pool = [
        driver for driver in context.drivers if _is_free(context, context.request, driver)
    ]
    usable = len(free_pool) - context.settings.min_protected_drivers
    if usable < 1:
        return ()

    taken: set[str] = set()
    offers: list[EngineOffer] = []
    for request in due:
        if len(offers) >= usable:
            break
        driver = _nearest_free(context, request, taken)
        if driver is None:
            continue
        taken.add(driver.id)
        offers.append(EngineOffer(request_id=request.id, driver_id=driver.id, case="B"))
    return tuple(offers)


def _nearby_dropoff_group(
    context: EngineContext,
    due: tuple[EngineRequest, ...],
) -> tuple[EngineRequest, ...]:
    radius = context.settings.near_destination_radius_meters
    current = context.request
    group = [
        request
        for request in due
        if request.status in _GROUPABLE_STATUSES
        and geodesic_meters(
            current.dropoff_lat,
            current.dropoff_lng,
            request.dropoff_lat,
            request.dropoff_lng,
        )
        <= radius
    ]
    return tuple(group)


def _assign_case_c(context: EngineContext, group: tuple[EngineRequest, ...]) -> EngineResult:
    group_id = str(uuid4())
    driver = _nearest_free_for_group(context, group)
    if driver is None:
        return EngineResult(case="C", offers=(), high_demand=True, group_id=None)
    offers = tuple(
        EngineOffer(
            request_id=request.id,
            driver_id=driver.id,
            case="C",
            group_id=group_id,
        )
        for request in group
    )
    return EngineResult(case="C", offers=offers, high_demand=True, group_id=group_id)


def _nearest_free_for_group(
    context: EngineContext,
    group: tuple[EngineRequest, ...],
) -> EngineDriver | None:
    candidates = [
        driver
        for driver in context.drivers
        if _is_free_for_group(context, group, driver)
    ]
    if not candidates:
        return None

    def distance(driver: EngineDriver) -> float:
        return min(
            geodesic_meters(
                driver.last_lat or 0.0,
                driver.last_lng or 0.0,
                request.restaurant_lat,
                request.restaurant_lng,
            )
            for request in group
        )

    return min(candidates, key=distance)


def _is_free_for_group(
    context: EngineContext,
    group: tuple[EngineRequest, ...],
    driver: EngineDriver,
) -> bool:
    if not _is_online_fresh(context, driver):
        return False
    if driver.status != "active" or not driver.is_online:
        return False
    if driver.has_open_offer:
        return False
    if any(driver.id in request.cycle_rejected_driver_ids for request in group):
        return False
    if any(driver.id in request.cycle_silent_driver_ids for request in group):
        return False
    if any(request.package_size == "grande" for request in group) and driver.compartment_size != "grande":
        return False
    extra_packages = sum(request.package_count for request in group)
    if driver.active_package_count + extra_packages > context.settings.max_active_packages_per_driver:
        return False
    cash_needed = sum(
        request.collect_cents for request in group if request.payment_method == "cash"
    )
    if cash_needed:
        available = driver.credit_limit_cents - driver.credit_held_cents
        if available < cash_needed:
            return False
    return _is_pre_free_or_idle(context, driver)


def _assign_case_d(context: EngineContext) -> tuple[EngineOffer, ...]:
    scored: list[tuple[int, EngineDriver]] = []
    for driver in context.drivers:
        score = _score_case_d(context, context.request, driver)
        if score is None:
            continue
        scored.append((score, driver))
    if not scored:
        return ()
    winner = max(scored, key=lambda item: item[0])[1]
    return (
        EngineOffer(request_id=context.request.id, driver_id=winner.id, case="D"),
    )


def _score_case_d(
    context: EngineContext,
    request: EngineRequest,
    driver: EngineDriver,
) -> int | None:
    if driver.active_request_status not in _ON_ROUTE_STATUSES:
        return None
    if not _is_eligible(context, request, driver):
        return None
    if driver.active_dropoff_lat is None or driver.active_dropoff_lng is None:
        return None
    if driver.last_lat is None or driver.last_lng is None:
        return None

    speed = context.settings.pre_free_speed_mps
    pickup_m = geodesic_meters(
        driver.last_lat, driver.last_lng, request.restaurant_lat, request.restaurant_lng
    )
    dest_m = geodesic_meters(
        request.dropoff_lat,
        request.dropoff_lng,
        driver.active_dropoff_lat,
        driver.active_dropoff_lng,
    )
    pickup_minutes = _meters_to_minutes(pickup_m, speed)
    dest_minutes = _meters_to_minutes(dest_m, speed)
    if pickup_minutes > context.settings.max_pickup_detour_minutes:
        return None
    if dest_minutes > context.settings.max_destination_detour_minutes:
        return None
    if pickup_minutes + dest_minutes > context.settings.max_extra_route_minutes:
        return None

    pickup_score = _proximity_score(pickup_m)
    dest_score = _proximity_score(dest_m)
    detour_score = _detour_score(
        pickup_minutes,
        dest_minutes,
        context.settings.max_pickup_detour_minutes,
        context.settings.max_destination_detour_minutes,
    )
    remaining = context.settings.max_active_packages_per_driver - (
        driver.active_package_count + request.package_count
    )
    capacity_score = max(0, min(100, remaining * 50))
    return (
        _PICKUP_PROXIMITY_WEIGHT * pickup_score
        + _DESTINATION_COMPAT_WEIGHT * dest_score
        + _DETOUR_WEIGHT * detour_score
        + _CAPACITY_WEIGHT * capacity_score
    )


def _meters_to_minutes(meters: float, speed_mps: float) -> float:
    if speed_mps <= 0:
        return float("inf")
    return (meters / speed_mps) / 60.0


def _proximity_score(meters: float) -> int:
    return max(0, min(100, int(100 - meters / 50)))


def _detour_score(
    pickup_minutes: float,
    dest_minutes: float,
    max_pickup: int,
    max_dest: int,
) -> int:
    pickup_ratio = pickup_minutes / max_pickup if max_pickup else 1.0
    dest_ratio = dest_minutes / max_dest if max_dest else 1.0
    used = max(pickup_ratio, dest_ratio)
    return max(0, min(100, int(100 * (1 - used))))


def _nearest_free(
    context: EngineContext,
    request: EngineRequest,
    taken: set[str],
) -> EngineDriver | None:
    candidates = [
        driver
        for driver in context.drivers
        if driver.id not in taken and _is_free(context, request, driver)
    ]
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda driver: geodesic_meters(
            driver.last_lat or 0.0,
            driver.last_lng or 0.0,
            request.restaurant_lat,
            request.restaurant_lng,
        ),
    )


def _is_free(context: EngineContext, request: EngineRequest, driver: EngineDriver) -> bool:
    if not _is_eligible(context, request, driver):
        return False
    return _is_pre_free_or_idle(context, driver)


def _is_pre_free_or_idle(context: EngineContext, driver: EngineDriver) -> bool:
    if driver.active_request_status not in _OCCUPIED_STATUSES:
        return True
    return _is_pre_free(context, driver)


def _is_pre_free(context: EngineContext, driver: EngineDriver) -> bool:
    if driver.occupied_job_count != 1:
        return False
    if driver.active_request_status != "in_transit":
        return False
    if driver.last_lat is None or driver.last_lng is None:
        return False
    if driver.active_dropoff_lat is None or driver.active_dropoff_lng is None:
        return False
    distance = geodesic_meters(
        driver.last_lat,
        driver.last_lng,
        driver.active_dropoff_lat,
        driver.active_dropoff_lng,
    )
    eta_seconds = distance / context.settings.pre_free_speed_mps
    return eta_seconds <= context.settings.pre_free_eta_seconds


def _is_eligible(context: EngineContext, request: EngineRequest, driver: EngineDriver) -> bool:
    if driver.status != "active" or not driver.is_online:
        return False
    if not _is_online_fresh(context, driver):
        return False
    if driver.has_open_offer:
        return False
    if driver.id in request.cycle_rejected_driver_ids:
        return False
    if driver.id in request.cycle_silent_driver_ids:
        return False
    if request.package_size == "grande" and driver.compartment_size != "grande":
        return False
    if (
        driver.active_package_count + request.package_count
        > context.settings.max_active_packages_per_driver
    ):
        return False
    if request.payment_method == "cash":
        available = driver.credit_limit_cents - driver.credit_held_cents
        if available < request.collect_cents:
            return False
    return True


def _is_online_fresh(context: EngineContext, driver: EngineDriver) -> bool:
    if not driver.is_online:
        return False
    if driver.last_lat is None or driver.last_lng is None or driver.location_updated_at is None:
        return False
    age = (context.now - driver.location_updated_at).total_seconds()
    return age <= context.settings.driver_location_staleness_seconds
