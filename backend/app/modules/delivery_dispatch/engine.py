from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from app.modules.delivery_dispatch.geo import geodesic_meters

_OCCUPIED_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})
_ON_ROUTE_STATUSES = frozenset({"picked_up", "in_transit"})
CaseName = Literal["A", "B", "C", "D", "E"]

_PICKUP_PROXIMITY_WEIGHT = 3
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
    max_extra_route_meters: int = 3840
    max_pickup_detour_meters: int = 1000
    max_destination_detour_meters: int = 3840
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
    dispatch_group_id: str | None = None
    restaurant_id: str | None = None


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
    heading_restaurant_id: str | None = None
    last_dropoff_lat: float | None = None
    last_dropoff_lng: float | None = None


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


@dataclass(frozen=True)
class HighDemandBreakdown:
    high_demand: bool
    few_free: bool
    high_occupancy: bool
    large_queue: bool
    free_count: int
    occupied_ratio: float
    pending_count: int


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

    hooked = _assign_case_c(context)
    if hooked.offers:
        return hooked

    driver = _nearest_free(context, context.request, taken=set())
    if driver is not None:
        return EngineResult(
            case="E",
            offers=(EngineOffer(request_id=context.request.id, driver_id=driver.id, case="E"),),
            high_demand=True,
        )

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


def high_demand_breakdown(context: EngineContext) -> HighDemandBreakdown:
    settings = context.settings
    free = [driver for driver in context.drivers if _is_free(context, context.request, driver)]
    few_free = len(free) <= settings.high_demand_available_drivers_max

    online_fresh = [driver for driver in context.drivers if _is_online_fresh(context, driver)]
    occupied = [
        driver
        for driver in online_fresh
        if driver.active_request_status in _OCCUPIED_STATUSES and not _is_pre_free(context, driver)
    ]
    occupied_ratio = (len(occupied) / len(online_fresh)) if online_fresh else 0.0
    high_occupancy = (
        bool(online_fresh) and occupied_ratio >= settings.high_demand_occupied_ratio
    )
    large_queue = context.pending_count >= settings.high_demand_pending_min
    return HighDemandBreakdown(
        high_demand=few_free or high_occupancy or large_queue,
        few_free=few_free,
        high_occupancy=high_occupancy,
        large_queue=large_queue,
        free_count=len(free),
        occupied_ratio=occupied_ratio,
        pending_count=context.pending_count,
    )


def _is_high_demand(context: EngineContext) -> bool:
    return high_demand_breakdown(context).high_demand


def eligibility_blockers(
    context: EngineContext,
    request: EngineRequest,
    driver: EngineDriver,
) -> tuple[str, ...]:
    reasons: list[str] = []
    if driver.status != "active":
        reasons.append("invited" if driver.status == "invited" else "blocked")
    if not driver.is_online:
        reasons.append("offline")
    elif not _is_online_fresh(context, driver):
        reasons.append("gps")
    if driver.has_open_offer:
        reasons.append("offer")
    if driver.id in request.cycle_rejected_driver_ids:
        reasons.append("rejected")
    if driver.id in request.cycle_silent_driver_ids:
        reasons.append("silent")
    if request.package_size == "grande" and driver.compartment_size != "grande":
        reasons.append("compartment")
    if (
        driver.active_package_count + request.package_count
        > context.settings.max_active_packages_per_driver
    ):
        reasons.append("packages")
    if request.payment_method == "cash":
        available = driver.credit_limit_cents - driver.credit_held_cents
        if available < request.collect_cents:
            reasons.append("credit")
    return tuple(reasons)


def pre_free_eta_seconds(context: EngineContext, driver: EngineDriver) -> int | None:
    if not _is_pre_free(context, driver):
        return None
    if (
        driver.last_lat is None
        or driver.last_lng is None
        or driver.active_dropoff_lat is None
        or driver.active_dropoff_lng is None
    ):
        return None
    distance = geodesic_meters(
        driver.last_lat,
        driver.last_lng,
        driver.active_dropoff_lat,
        driver.active_dropoff_lng,
    )
    return int(distance / context.settings.pre_free_speed_mps)


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


def _assign_case_c(context: EngineContext) -> EngineResult:
    request = context.request
    candidates = [
        driver
        for driver in context.drivers
        if _is_case_c_hook(context, request, driver)
    ]
    if not candidates:
        return EngineResult(case=None, offers=(), high_demand=True)

    def distance(driver: EngineDriver) -> float:
        return geodesic_meters(
            driver.last_dropoff_lat or 0.0,
            driver.last_dropoff_lng or 0.0,
            request.dropoff_lat,
            request.dropoff_lng,
        )

    winner = min(candidates, key=distance)
    return EngineResult(
        case="C",
        offers=(EngineOffer(request_id=request.id, driver_id=winner.id, case="C"),),
        high_demand=True,
    )


def _is_case_c_hook(
    context: EngineContext,
    request: EngineRequest,
    driver: EngineDriver,
) -> bool:
    if not request.restaurant_id or not driver.heading_restaurant_id:
        return False
    if driver.active_request_status != "assigned":
        return False
    if driver.heading_restaurant_id != request.restaurant_id:
        return False
    if driver.last_dropoff_lat is None or driver.last_dropoff_lng is None:
        return False
    if not _is_eligible(context, request, driver):
        return False
    distance = geodesic_meters(
        driver.last_dropoff_lat,
        driver.last_dropoff_lng,
        request.dropoff_lat,
        request.dropoff_lng,
    )
    return distance <= context.settings.near_destination_radius_meters


def nn_last_dropoff(
    dropoffs: tuple[tuple[float, float], ...],
    *,
    origin_lat: float,
    origin_lng: float,
) -> tuple[float, float] | None:
    remaining = list(dropoffs)
    if not remaining:
        return None
    lat, lng = origin_lat, origin_lng
    last = remaining[0]
    while remaining:
        last = min(
            remaining,
            key=lambda point: geodesic_meters(lat, lng, point[0], point[1]),
        )
        remaining.remove(last)
        lat, lng = last
    return last


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
    if driver.last_lat is None or driver.last_lng is None:
        return None

    pickup_m = geodesic_meters(
        driver.last_lat, driver.last_lng, request.restaurant_lat, request.restaurant_lng
    )
    if pickup_m > context.settings.max_pickup_detour_meters:
        return None

    pickup_score = _proximity_score(pickup_m)
    remaining = context.settings.max_active_packages_per_driver - (
        driver.active_package_count + request.package_count
    )
    capacity_score = max(0, min(100, remaining * 50))
    return (
        _PICKUP_PROXIMITY_WEIGHT * pickup_score
        + _CAPACITY_WEIGHT * capacity_score
    )


def _proximity_score(meters: float) -> int:
    return max(0, min(100, int(100 - meters / 50)))


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
