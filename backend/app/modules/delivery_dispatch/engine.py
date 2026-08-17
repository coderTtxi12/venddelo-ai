from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.modules.delivery_dispatch.geo import geodesic_meters

_OCCUPIED_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})
CaseName = Literal["A", "B"]


@dataclass(frozen=True)
class EngineSettings:
    driver_location_staleness_seconds: int = 90
    min_protected_drivers: int = 2
    high_demand_available_drivers_max: int = 2
    high_demand_occupied_ratio: float = 0.80
    high_demand_pending_min: int = 5
    max_active_packages_per_driver: int = 3


@dataclass(frozen=True)
class EngineRequest:
    id: str
    restaurant_lat: float
    restaurant_lng: float
    package_size: str
    package_count: int
    payment_method: str
    collect_cents: int
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


@dataclass(frozen=True)
class EngineResult:
    case: CaseName | None
    offers: tuple[EngineOffer, ...]
    high_demand: bool


def choose_assignments(context: EngineContext) -> EngineResult:
    high_demand = _is_high_demand(context)
    if high_demand:
        return EngineResult(case=None, offers=(), high_demand=True)

    due = _due_requests(context)
    if len(due) > 1:
        offers = _assign_case_b(context, due)
        if not offers:
            return EngineResult(case=None, offers=(), high_demand=True)
        return EngineResult(case="B", offers=offers, high_demand=False)

    driver = _nearest_free(context, context.request, taken=set())
    if driver is None:
        return EngineResult(case=None, offers=(), high_demand=False)
    return EngineResult(
        case="A",
        offers=(EngineOffer(request_id=context.request.id, driver_id=driver.id, case="A"),),
        high_demand=False,
    )


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
        if driver.active_request_status in _OCCUPIED_STATUSES
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
    return driver.active_request_status not in _OCCUPIED_STATUSES


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
