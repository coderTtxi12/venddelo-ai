from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.db.models.delivery import (
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryProviderAssignmentSettings,
)
from app.db.models.restaurant import Restaurant
from app.modules.delivery_dispatch.engine import (
    EngineContext,
    EngineDriver,
    EngineRequest,
    EngineSettings,
    assignment_timed_out,
    choose_assignments,
)
from app.modules.delivery_dispatch.geo import geodesic_meters
from app.modules.delivery_dispatch.notify import notify_offer

_SEARCHABLE = frozenset({"scheduled", "searching", "offered"})
_OCCUPIED = frozenset({"assigned", "picked_up", "in_transit"})
_PENDING = frozenset({"scheduled", "searching", "offered"})


@dataclass
class QueuedTask:
    kind: str
    eta: datetime
    payload: dict


class StubTaskBus:
    def __init__(self) -> None:
        self.jobs: list[QueuedTask] = []

    def enqueue(self, kind: str, eta: datetime, payload: dict) -> None:
        self.jobs.append(QueuedTask(kind=kind, eta=eta, payload=payload))

    def clear(self) -> None:
        self.jobs.clear()


stub_bus = StubTaskBus()


def get_task_bus() -> StubTaskBus:
    return stub_bus


def enqueue(kind: str, eta: datetime, payload: dict) -> None:
    get_task_bus().enqueue(kind, eta, payload)


def authorize_internal_task(secret_header: str | None) -> None:
    settings = get_settings()
    if settings.delivery_tasks_backend == "stub":
        return
    if settings.delivery_tasks_secret and secret_header == settings.delivery_tasks_secret:
        return
    raise UnauthorizedError("Unauthorized")


def handle_task(session: Session, payload: dict, now: datetime | None = None) -> None:
    current = now or datetime.now(UTC)
    kind = payload["kind"]
    request_id = uuid.UUID(str(payload["request_id"]))
    if kind in {"search", "retry"}:
        run_search(session, request_id, current)
        return
    if kind == "expire_offer":
        offer_id = payload.get("offer_id")
        if offer_id is None:
            return
        handle_expire_offer(session, uuid.UUID(str(offer_id)), current)


def run_search(session: Session, request_id: uuid.UUID, now: datetime) -> None:
    request = session.scalar(
        select(DeliveryDispatchRequest)
        .where(
            DeliveryDispatchRequest.id == request_id,
            DeliveryDispatchRequest.status.in_(tuple(_SEARCHABLE)),
        )
        .with_for_update(skip_locked=True)
    )
    if request is None:
        return
    if _as_utc(request.search_at) > now:
        return
    if _live_offer(session, request.id, now) is not None:
        return
    if _live_group_offer(session, request, now) is not None:
        return
    settings_row = session.get(
        DeliveryProviderAssignmentSettings,
        request.delivery_provider_id,
    )
    timeout_seconds = (
        settings_row.assignment_timeout_seconds if settings_row is not None else 900
    )
    if assignment_timed_out(now, _as_utc(request.search_at), timeout_seconds):
        request.status = "unassigned"
        return
    _assign_or_retry(session, request, now)


def handle_expire_offer(session: Session, offer_id: uuid.UUID, now: datetime) -> None:
    offer = session.scalar(
        select(DeliveryDispatchOffer)
        .where(DeliveryDispatchOffer.id == offer_id)
        .with_for_update()
    )
    if offer is None or offer.status != "offered":
        return
    request = session.scalar(
        select(DeliveryDispatchRequest)
        .where(DeliveryDispatchRequest.id == offer.request_id)
        .with_for_update()
    )
    if request is None:
        return
    offer.status = "expired"
    offer.responded_at = now
    request.status = "searching"
    request.cycle_silent_driver_ids = [
        *(request.cycle_silent_driver_ids or []),
        offer.driver_id,
    ]
    former_members = _clear_dispatch_group(session, request)
    _timeout_unresumable_former_members(
        session, former_members, skip_id=request.id, now=now
    )
    _assign_or_retry(session, request, now)
    _resume_former_group_members(session, former_members, skip_id=request.id, now=now)


def reject_offer_and_search(
    session: Session,
    offer: DeliveryDispatchOffer,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    offer.status = "rejected"
    offer.responded_at = now
    request.status = "searching"
    request.cycle_rejected_driver_ids = [
        *(request.cycle_rejected_driver_ids or []),
        offer.driver_id,
    ]
    former_members = _clear_dispatch_group(session, request)
    _timeout_unresumable_former_members(
        session, former_members, skip_id=request.id, now=now
    )
    _assign_or_retry(session, request, now)
    _resume_former_group_members(session, former_members, skip_id=request.id, now=now)


def release_group_on_cancel(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    group_id = request.dispatch_group_id
    if group_id is None:
        return
    was_offered_primary = request.status == "offered"
    live_offer = _live_offer(session, request.id, now) if was_offered_primary else None
    request.dispatch_group_id = None
    if not was_offered_primary or live_offer is None:
        return
    live_offer.status = "expired"
    live_offer.responded_at = now
    remaining = list(
        session.scalars(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.dispatch_group_id == group_id)
            .with_for_update()
        ).all()
    )
    for member in remaining:
        member.dispatch_group_id = None
    _timeout_unresumable_former_members(
        session, remaining, skip_id=request.id, now=now
    )
    _resume_former_group_members(session, remaining, skip_id=request.id, now=now)


def reset_cycle_driver_ids(request: DeliveryDispatchRequest) -> None:
    request.cycle_rejected_driver_ids = []
    request.cycle_silent_driver_ids = []


def _assign_or_retry(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    settings_row = session.get(
        DeliveryProviderAssignmentSettings,
        request.delivery_provider_id,
        with_for_update=True,
    )
    if settings_row is None:
        _enqueue_retry(session, request, now)
        return
    if assignment_timed_out(
        now, _as_utc(request.search_at), settings_row.assignment_timeout_seconds
    ):
        request.status = "unassigned"
        return

    extra_excluded: set[str] = set()
    drivers = list(_load_drivers(session, request.delivery_provider_id))
    for _ in range(len(drivers) + 1):
        context = _build_context(
            session,
            request,
            settings_row,
            drivers,
            now,
            extra_excluded=extra_excluded,
        )
        result = choose_assignments(context)
        chosen = next(
            (item for item in result.offers if item.request_id == str(request.id)),
            None,
        )
        if chosen is None:
            _enqueue_retry(session, request, now)
            return

        driver_id = uuid.UUID(chosen.driver_id)
        driver = session.scalar(
            select(DeliveryDriver).where(DeliveryDriver.id == driver_id).with_for_update()
        )
        if driver is None or _driver_busy(
            session, driver, now, case=chosen.case, settings_row=settings_row
        ):
            extra_excluded.add(chosen.driver_id)
            continue

        expires_at = now + timedelta(seconds=settings_row.offer_timeout_seconds)
        offer = DeliveryDispatchOffer(
            request_id=request.id,
            driver_id=driver.id,
            status="offered",
            case_applied=chosen.case,
            expires_at=expires_at,
            score_json={"case": chosen.case, "group_id": result.group_id},
        )
        session.add(offer)
        session.flush()
        request.status = "offered"
        if result.case == "C" and result.group_id:
            group_uuid = uuid.UUID(result.group_id)
            for item in result.offers:
                grouped = session.get(DeliveryDispatchRequest, uuid.UUID(item.request_id))
                if grouped is None:
                    continue
                if (
                    grouped.dispatch_group_id is not None
                    and grouped.dispatch_group_id != group_uuid
                    and _live_group_offer(session, grouped, now) is not None
                ):
                    continue
                grouped.dispatch_group_id = group_uuid
        request.decision_json = {
            "case": result.case,
            "high_demand": result.high_demand,
            "driver_id": str(driver.id),
            "group_id": result.group_id,
        }
        notify_offer(driver, offer)
        enqueue(
            "expire_offer",
            expires_at,
            {
                "kind": "expire_offer",
                "request_id": str(request.id),
                "offer_id": str(offer.id),
            },
        )
        return

    _enqueue_retry(session, request, now)


def _enqueue_retry(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    retry_seconds = 30
    settings_row = session.get(
        DeliveryProviderAssignmentSettings,
        request.delivery_provider_id,
    )
    if settings_row is not None:
        retry_seconds = settings_row.assignment_retry_seconds
    request.status = "searching"
    request.next_attempt_at = now + timedelta(seconds=retry_seconds)
    reset_cycle_driver_ids(request)
    enqueue(
        "retry",
        request.next_attempt_at,
        {"kind": "retry", "request_id": str(request.id)},
    )


def _build_context(
    session: Session,
    request: DeliveryDispatchRequest,
    settings_row: DeliveryProviderAssignmentSettings,
    drivers: list[DeliveryDriver],
    now: datetime,
    extra_excluded: set[str],
) -> EngineContext:
    restaurant = session.get(Restaurant, request.restaurant_id)
    restaurant_lat = restaurant.latitude if restaurant and restaurant.latitude is not None else 0.0
    restaurant_lng = (
        restaurant.longitude if restaurant and restaurant.longitude is not None else 0.0
    )

    due_rows = session.scalars(
        select(DeliveryDispatchRequest).where(
            DeliveryDispatchRequest.delivery_provider_id == request.delivery_provider_id,
            DeliveryDispatchRequest.status.in_(tuple(_PENDING)),
            DeliveryDispatchRequest.search_at <= now,
        )
    ).all()
    pending_count = session.scalars(
        select(DeliveryDispatchRequest.id).where(
            DeliveryDispatchRequest.delivery_provider_id == request.delivery_provider_id,
            DeliveryDispatchRequest.status.in_(tuple(_PENDING)),
        )
    ).all()

    occupied_rows = session.scalars(
        select(DeliveryDispatchRequest).where(
            DeliveryDispatchRequest.delivery_provider_id == request.delivery_provider_id,
            DeliveryDispatchRequest.status.in_(tuple(_OCCUPIED)),
        )
    ).all()
    occupied_by_driver: dict[uuid.UUID, list[DeliveryDispatchRequest]] = defaultdict(list)
    active_packages: dict[uuid.UUID, int] = {}
    for row in occupied_rows:
        if row.assigned_driver_id is None:
            continue
        occupied_by_driver[row.assigned_driver_id].append(row)
        active_packages[row.assigned_driver_id] = (
            active_packages.get(row.assigned_driver_id, 0) + row.package_count
        )

    open_offer_ids = set(
        session.scalars(
            select(DeliveryDispatchOffer.driver_id).where(
                DeliveryDispatchOffer.status == "offered",
                DeliveryDispatchOffer.expires_at > now,
            )
        ).all()
    )

    engine_request = _to_engine_request(
        request,
        restaurant_lat,
        restaurant_lng,
        extra_excluded,
    )
    due_siblings = []
    for row in due_rows:
        rest = session.get(Restaurant, row.restaurant_id)
        due_siblings.append(
            _to_engine_request(
                row,
                rest.latitude if rest and rest.latitude is not None else 0.0,
                rest.longitude if rest and rest.longitude is not None else 0.0,
                extra_excluded if row.id == request.id else set(),
            )
        )

    engine_drivers = tuple(
        _to_engine_driver(
            driver,
            occupied_by_driver.get(driver.id, []),
            active_packages.get(driver.id, 0),
            driver.id in open_offer_ids,
        )
        for driver in drivers
    )
    return EngineContext(
        now=now,
        settings=_engine_settings(settings_row),
        request=engine_request,
        due_siblings=tuple(due_siblings) or (engine_request,),
        drivers=engine_drivers,
        pending_count=len(pending_count),
    )


def _to_engine_request(
    request: DeliveryDispatchRequest,
    restaurant_lat: float,
    restaurant_lng: float,
    extra_excluded: set[str],
) -> EngineRequest:
    rejected = tuple(str(item) for item in (request.cycle_rejected_driver_ids or []))
    silent = tuple(str(item) for item in (request.cycle_silent_driver_ids or []))
    if extra_excluded:
        silent = silent + tuple(extra_excluded)
    return EngineRequest(
        id=str(request.id),
        restaurant_lat=restaurant_lat,
        restaurant_lng=restaurant_lng,
        package_size=request.package_size,
        package_count=request.package_count,
        payment_method=request.payment_method,
        collect_cents=request.collect_cents,
        dropoff_lat=request.dropoff_lat,
        dropoff_lng=request.dropoff_lng,
        status=request.status,
        cycle_rejected_driver_ids=rejected,
        cycle_silent_driver_ids=silent,
        dispatch_group_id=str(request.dispatch_group_id) if request.dispatch_group_id else None,
    )


def _to_engine_driver(
    driver: DeliveryDriver,
    occupied_jobs: list[DeliveryDispatchRequest],
    active_package_count: int,
    has_open_offer: bool,
) -> EngineDriver:
    active = None
    if len(occupied_jobs) == 1:
        active = occupied_jobs[0]
    elif occupied_jobs:
        active = next(
            (job for job in occupied_jobs if job.status == "in_transit"),
            occupied_jobs[0],
        )
    return EngineDriver(
        id=str(driver.id),
        status=driver.status,
        is_online=driver.is_online,
        last_lat=driver.last_lat,
        last_lng=driver.last_lng,
        location_updated_at=_as_utc(driver.location_updated_at)
        if driver.location_updated_at
        else None,
        credit_limit_cents=driver.credit_limit_cents,
        credit_held_cents=driver.credit_held_cents,
        compartment_size=driver.compartment_size,
        active_request_status=active.status if active is not None else None,
        active_package_count=active_package_count,
        has_open_offer=has_open_offer,
        active_dropoff_lat=active.dropoff_lat if active is not None else None,
        active_dropoff_lng=active.dropoff_lng if active is not None else None,
        occupied_job_count=len(occupied_jobs),
    )


def _engine_settings(row: DeliveryProviderAssignmentSettings) -> EngineSettings:
    return EngineSettings(
        driver_location_staleness_seconds=row.driver_location_staleness_seconds,
        min_protected_drivers=row.min_protected_drivers,
        high_demand_available_drivers_max=row.high_demand_available_drivers_max,
        high_demand_occupied_ratio=row.high_demand_occupied_ratio,
        high_demand_pending_min=row.high_demand_pending_min,
        max_active_packages_per_driver=row.max_active_packages_per_driver,
        pre_free_eta_seconds=row.pre_free_eta_seconds,
        pre_free_speed_mps=row.pre_free_speed_mps,
        near_destination_radius_meters=row.near_destination_radius_meters,
        max_extra_route_minutes=row.max_extra_route_minutes,
        max_pickup_detour_minutes=row.max_pickup_detour_minutes,
        max_destination_detour_minutes=row.max_destination_detour_minutes,
        assignment_timeout_seconds=row.assignment_timeout_seconds,
    )


def _load_drivers(session: Session, provider_id: uuid.UUID) -> list[DeliveryDriver]:
    return list(
        session.scalars(
            select(DeliveryDriver).where(DeliveryDriver.delivery_provider_id == provider_id)
        ).all()
    )


def _live_offer(
    session: Session,
    request_id: uuid.UUID,
    now: datetime,
) -> DeliveryDispatchOffer | None:
    return session.scalar(
        select(DeliveryDispatchOffer).where(
            DeliveryDispatchOffer.request_id == request_id,
            DeliveryDispatchOffer.status == "offered",
            DeliveryDispatchOffer.expires_at > now,
        )
    )


def _live_group_offer(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> DeliveryDispatchOffer | None:
    if request.dispatch_group_id is None:
        return None
    return session.scalar(
        select(DeliveryDispatchOffer)
        .join(
            DeliveryDispatchRequest,
            DeliveryDispatchOffer.request_id == DeliveryDispatchRequest.id,
        )
        .where(
            DeliveryDispatchRequest.dispatch_group_id == request.dispatch_group_id,
            DeliveryDispatchOffer.status == "offered",
            DeliveryDispatchOffer.expires_at > now,
        )
    )


def _clear_dispatch_group(
    session: Session, request: DeliveryDispatchRequest
) -> list[DeliveryDispatchRequest]:
    group_id = request.dispatch_group_id
    if group_id is None:
        return []
    members = list(
        session.scalars(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.dispatch_group_id == group_id)
            .with_for_update()
        ).all()
    )
    for member in members:
        member.dispatch_group_id = None
    return members


def _timeout_unresumable_former_members(
    session: Session,
    members: list[DeliveryDispatchRequest],
    *,
    skip_id: uuid.UUID,
    now: datetime,
) -> None:
    for member in members:
        if member.id == skip_id or member.status != "searching":
            continue
        settings_row = session.get(
            DeliveryProviderAssignmentSettings,
            member.delivery_provider_id,
        )
        timeout_seconds = (
            settings_row.assignment_timeout_seconds if settings_row is not None else 900
        )
        if assignment_timed_out(now, _as_utc(member.search_at), timeout_seconds):
            member.status = "unassigned"


def _resume_former_group_members(
    session: Session,
    members: list[DeliveryDispatchRequest],
    *,
    skip_id: uuid.UUID,
    now: datetime,
) -> None:
    for member in members:
        if member.id == skip_id:
            continue
        if member.status != "searching":
            continue
        if _live_group_offer(session, member, now) is not None:
            continue
        enqueue(
            "search",
            now,
            {"kind": "search", "request_id": str(member.id)},
        )


def _driver_busy(
    session: Session,
    driver: DeliveryDriver,
    now: datetime,
    *,
    case: str,
    settings_row: DeliveryProviderAssignmentSettings,
) -> bool:
    open_offer = session.scalar(
        select(DeliveryDispatchOffer.id).where(
            DeliveryDispatchOffer.driver_id == driver.id,
            DeliveryDispatchOffer.status == "offered",
            DeliveryDispatchOffer.expires_at > now,
        )
    )
    if open_offer is not None:
        return True
    occupied_rows = list(
        session.scalars(
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.assigned_driver_id == driver.id,
                DeliveryDispatchRequest.status.in_(tuple(_OCCUPIED)),
            )
        ).all()
    )
    if not occupied_rows:
        return False
    if case == "D":
        return False
    return not _occupied_is_pre_free(driver, occupied_rows, settings_row)


def _occupied_is_pre_free(
    driver: DeliveryDriver,
    occupied_rows: list[DeliveryDispatchRequest],
    settings_row: DeliveryProviderAssignmentSettings,
) -> bool:
    if len(occupied_rows) != 1:
        return False
    job = occupied_rows[0]
    if job.status != "in_transit":
        return False
    if driver.last_lat is None or driver.last_lng is None:
        return False
    eta_seconds = (
        geodesic_meters(driver.last_lat, driver.last_lng, job.dropoff_lat, job.dropoff_lng)
        / settings_row.pre_free_speed_mps
    )
    return eta_seconds <= settings_row.pre_free_eta_seconds


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
