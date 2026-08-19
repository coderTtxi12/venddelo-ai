from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
from app.modules.delivery_dispatch.assignment_log import (
    expired_title,
    manual_title,
    offered_detail,
    offered_title,
    record_assignment_event,
    rejected_title,
    searched_detail_from_context,
    timed_out_title,
)
from app.modules.delivery_dispatch.cloud_tasks import GcpTaskBus
from app.modules.delivery_dispatch.engine import (
    EngineContext,
    EngineDriver,
    EngineOffer,
    EngineRequest,
    EngineResult,
    EngineSettings,
    assignment_timed_out,
    choose_assignments,
)
from app.modules.delivery_dispatch.geo import geodesic_meters
from app.modules.delivery_dispatch.monitor_notify import notify_request_realtime
from app.modules.delivery_dispatch.notify import notify_offer

logger = logging.getLogger(__name__)

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
_SESSION_PENDING_KEY = "delivery_pending_gcp_jobs"
_pending_gcp_jobs: ContextVar[list[QueuedTask] | None] = ContextVar(
    "delivery_pending_gcp_jobs",
    default=None,
)
_gcp_bus: GcpTaskBus | None = None


def get_task_bus() -> StubTaskBus:
    return stub_bus


def _gcp_buffer(session: Session | None) -> list[QueuedTask]:
    if session is not None:
        pending = session.info.get(_SESSION_PENDING_KEY)
        if not isinstance(pending, list):
            pending = []
            session.info[_SESSION_PENDING_KEY] = pending
        return pending
    pending = _pending_gcp_jobs.get()
    if pending is None:
        pending = []
        _pending_gcp_jobs.set(pending)
    return pending


def enqueue(
    kind: str,
    eta: datetime,
    payload: dict,
    session: Session | None = None,
) -> None:
    if get_settings().delivery_tasks_backend == "gcp":
        _gcp_buffer(session).append(QueuedTask(kind=kind, eta=eta, payload=payload))
        logger.info(
            "cloud tasks buffered kind=%s request_id=%s via=%s",
            kind,
            payload.get("request_id"),
            "session" if session is not None else "context",
        )
        return
    stub_bus.enqueue(kind, eta, payload)


def flush_delivery_tasks(session: Session | None = None) -> None:
    pending: list[QueuedTask] = []
    if session is not None:
        pending.extend(session.info.pop(_SESSION_PENDING_KEY, []) or [])
    pending.extend(_pending_gcp_jobs.get() or [])
    _pending_gcp_jobs.set([])
    if not pending:
        return
    try:
        bus = _gcp_bus if _gcp_bus is not None else GcpTaskBus.from_settings(get_settings())
        for job in pending:
            bus.enqueue(job.kind, job.eta, job.payload)
    except Exception:
        logger.exception(
            "cloud tasks flush failed count=%s; local needs "
            "`gcloud auth application-default login`",
            len(pending),
        )


def discard_delivery_tasks(session: Session | None = None) -> None:
    if session is not None:
        session.info.pop(_SESSION_PENDING_KEY, None)
    _pending_gcp_jobs.set([])


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
    timeout_seconds = settings_row.assignment_timeout_seconds if settings_row is not None else 900
    if assignment_timed_out(now, _as_utc(request.search_at), timeout_seconds):
        request.status = "unassigned"
        record_assignment_event(
            session,
            request,
            kind="timed_out",
            tone="warn",
            title=timed_out_title(),
            detail=None,
        )
        notify_request_realtime(session, request)
        return
    _assign_or_retry(session, request, now)
    notify_request_realtime(session, request)


def handle_expire_offer(session: Session, offer_id: uuid.UUID, now: datetime) -> None:
    peek = session.get(DeliveryDispatchOffer, offer_id)
    if peek is None or peek.status != "offered":
        return
    request, _group = lock_request_and_group(session, peek.request_id)
    offer = session.scalar(
        select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.id == offer_id).with_for_update()
    )
    if offer is None or offer.status != "offered":
        return
    if request is None:
        request = session.scalar(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.id == offer.request_id)
            .with_for_update()
        )
    if request is None:
        return
    offer.status = "expired"
    offer.responded_at = now
    restore_status = None
    if offer.case_applied == "M" and isinstance(offer.score_json, dict):
        restore_status = offer.score_json.get("restore_status")
    if request.status in _OCCUPIED:
        notify_request_realtime(session, request)
        return
    if restore_status == "unassigned":
        request.status = "unassigned"
        notify_request_realtime(session, request)
        return
    if request.status not in {"offered", "searching"}:
        notify_request_realtime(session, request)
        return
    request.status = "searching"
    request.cycle_silent_driver_ids = [
        *(request.cycle_silent_driver_ids or []),
        offer.driver_id,
    ]
    driver = offer.driver
    if driver is None:
        driver = session.get(DeliveryDriver, offer.driver_id)
    record_assignment_event(
        session,
        request,
        kind="expired",
        tone="warn",
        title=expired_title(driver.first_name if driver else None),
        detail="Sigue buscando.",
        next_attempt_at=request.next_attempt_at if request.status == "searching" else None,
        driver_id=offer.driver_id,
    )
    former_members = _clear_dispatch_group(session, request)
    _timeout_unresumable_former_members(session, former_members, skip_id=request.id, now=now)
    _assign_or_retry(session, request, now)
    _resume_former_group_members(session, former_members, skip_id=request.id, now=now)
    notify_request_realtime(session, request)


def reject_offer_and_search(
    session: Session,
    offer: DeliveryDispatchOffer,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    offer.status = "rejected"
    offer.responded_at = now
    if request.status in _OCCUPIED:
        return
    restore_status = None
    if offer.case_applied == "M" and isinstance(offer.score_json, dict):
        restore_status = offer.score_json.get("restore_status")
    if restore_status == "unassigned":
        request.status = "unassigned"
        driver = session.get(DeliveryDriver, offer.driver_id)
        record_assignment_event(
            session,
            request,
            kind="rejected",
            tone="warn",
            title=rejected_title(driver.first_name if driver else None),
            detail=None,
            next_attempt_at=None,
            driver_id=offer.driver_id,
        )
        return
    request.status = "searching"
    request.cycle_rejected_driver_ids = [
        *(request.cycle_rejected_driver_ids or []),
        offer.driver_id,
    ]
    driver = session.get(DeliveryDriver, offer.driver_id)
    driver_name = driver.first_name if driver else None
    record_assignment_event(
        session,
        request,
        kind="rejected",
        tone="warn",
        title=rejected_title(driver_name),
        detail="Sigue buscando." if request.status == "searching" else None,
        next_attempt_at=request.next_attempt_at if request.status == "searching" else None,
        driver_id=offer.driver_id,
    )
    former_members = _clear_dispatch_group(session, request)
    _timeout_unresumable_former_members(session, former_members, skip_id=request.id, now=now)
    _assign_or_retry(session, request, now)
    _resume_former_group_members(session, former_members, skip_id=request.id, now=now)


def close_offered_offers(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> list[DeliveryDispatchOffer]:
    offers = list(
        session.scalars(
            select(DeliveryDispatchOffer)
            .where(
                DeliveryDispatchOffer.request_id == request.id,
                DeliveryDispatchOffer.status == "offered",
            )
            .with_for_update()
        ).all()
    )
    for offer in offers:
        offer.status = "expired"
        offer.responded_at = now
    return offers


def release_group_on_cancel(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    group_id = request.dispatch_group_id
    if group_id is None:
        return
    was_offered_primary = request.status == "offered"
    request.dispatch_group_id = None
    if not was_offered_primary:
        return
    remaining = list(
        session.scalars(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.dispatch_group_id == group_id)
            .with_for_update()
        ).all()
    )
    for member in remaining:
        member.dispatch_group_id = None
    _timeout_unresumable_former_members(session, remaining, skip_id=request.id, now=now)
    _resume_former_group_members(session, remaining, skip_id=request.id, now=now)


def reset_cycle_driver_ids(request: DeliveryDispatchRequest) -> None:
    request.cycle_rejected_driver_ids = []
    request.cycle_silent_driver_ids = []


def restart_unassigned_search(
    session: Session | None,
    request: DeliveryDispatchRequest,
    now: datetime,
) -> None:
    request.status = "searching"
    request.search_at = now
    request.next_attempt_at = now
    reset_cycle_driver_ids(request)
    enqueue(
        "search",
        now,
        {"kind": "search", "request_id": str(request.id)},
        session=session,
    )


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
        record_assignment_event(
            session,
            request,
            kind="timed_out",
            tone="warn",
            title=timed_out_title(),
            detail=None,
        )
        return

    extra_excluded: set[str] = set()
    drivers = list(_load_drivers(session, request.delivery_provider_id))
    last_context: EngineContext | None = None
    last_high_demand = False
    for _ in range(len(drivers) + 1):
        context = _build_context(
            session,
            request,
            settings_row,
            drivers,
            now,
            extra_excluded=extra_excluded,
        )
        last_context = context
        result = choose_assignments(context)
        last_high_demand = result.high_demand
        if not result.offers:
            _enqueue_retry(
                session,
                request,
                now,
                context=context,
                high_demand=result.high_demand,
            )
            return

        expires_at = now + timedelta(seconds=settings_row.offer_timeout_seconds)
        if result.case == "B":
            prepared: list[tuple[EngineOffer, DeliveryDriver]] = []
            busy = False
            for item in result.offers:
                driver = session.scalar(
                    select(DeliveryDriver)
                    .where(DeliveryDriver.id == uuid.UUID(item.driver_id))
                    .with_for_update()
                )
                if driver is None or _driver_busy(
                    session, driver, now, case=item.case, settings_row=settings_row
                ):
                    extra_excluded.add(item.driver_id)
                    busy = True
                    break
                prepared.append((item, driver))
            if busy:
                continue
            persisted_current = False
            conflict = False
            for item, driver in prepared:
                target = _lock_offer_target(session, request, uuid.UUID(item.request_id), now)
                if target is None:
                    continue
                created = _persist_dispatch_offer(
                    session,
                    target,
                    driver,
                    case=item.case,
                    high_demand=result.high_demand,
                    group_id=result.group_id,
                    expires_at=expires_at,
                )
                if created is None:
                    extra_excluded.add(item.driver_id)
                    conflict = True
                    break
                if target.id == request.id:
                    persisted_current = True
            if conflict:
                continue
            if not persisted_current:
                _enqueue_retry(
                    session,
                    request,
                    now,
                    context=context,
                    high_demand=result.high_demand,
                )
            return

        chosen = next(
            (item for item in result.offers if item.request_id == str(request.id)),
            None,
        )
        if chosen is None:
            _enqueue_retry(
                session,
                request,
                now,
                context=context,
                high_demand=result.high_demand,
            )
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

        if chosen.case == "C" and result.group_id:
            locked_members = _lock_case_c_members(session, request, result)
        else:
            locked_members = {request.id: request}

        created = _persist_dispatch_offer(
            session,
            request,
            driver,
            case=chosen.case,
            high_demand=result.high_demand,
            group_id=result.group_id,
            expires_at=expires_at,
        )
        if created is None:
            extra_excluded.add(chosen.driver_id)
            continue
        if result.case == "C" and result.group_id:
            _attach_case_c_group(session, request, result, now, locked_members)
        return

    _enqueue_retry(
        session,
        request,
        now,
        context=last_context,
        high_demand=last_high_demand,
    )


def lock_request_and_group(
    session: Session,
    request_id: uuid.UUID,
) -> tuple[DeliveryDispatchRequest | None, list[DeliveryDispatchRequest]]:
    locked: dict[uuid.UUID, DeliveryDispatchRequest] = {}
    pending = {request_id}
    while pending:
        for rid in sorted(pending):
            row = session.scalar(
                select(DeliveryDispatchRequest)
                .where(DeliveryDispatchRequest.id == rid)
                .with_for_update()
            )
            if row is not None:
                locked[rid] = row
        pending = set()
        for row in locked.values():
            if row.dispatch_group_id is None:
                continue
            member_ids = session.scalars(
                select(DeliveryDispatchRequest.id).where(
                    DeliveryDispatchRequest.dispatch_group_id == row.dispatch_group_id
                )
            )
            for member_id in member_ids:
                if member_id not in locked:
                    pending.add(member_id)
    request = locked.get(request_id)
    return request, [locked[rid] for rid in sorted(locked)]


def _lock_case_c_members(
    session: Session,
    request: DeliveryDispatchRequest,
    result: EngineResult,
) -> dict[uuid.UUID, DeliveryDispatchRequest]:
    locked = {request.id: request}
    member_ids = sorted({uuid.UUID(item.request_id) for item in result.offers})
    for member_id in member_ids:
        if member_id == request.id:
            continue
        row = session.scalar(
            select(DeliveryDispatchRequest)
            .where(
                DeliveryDispatchRequest.id == member_id,
                DeliveryDispatchRequest.status.in_(tuple(_SEARCHABLE)),
            )
            .with_for_update(skip_locked=True)
        )
        if row is not None:
            locked[member_id] = row
    return locked


def _attach_case_c_group(
    session: Session,
    request: DeliveryDispatchRequest,
    result: EngineResult,
    now: datetime,
    locked_members: dict[uuid.UUID, DeliveryDispatchRequest],
) -> None:
    if result.group_id is None:
        return
    locked_members.setdefault(request.id, request)
    group_uuid = uuid.UUID(result.group_id)
    for item in result.offers:
        grouped = locked_members.get(uuid.UUID(item.request_id))
        if grouped is None:
            continue
        if (
            grouped.dispatch_group_id is not None
            and grouped.dispatch_group_id != group_uuid
            and _live_group_offer(session, grouped, now) is not None
        ):
            continue
        grouped.dispatch_group_id = group_uuid


def _lock_offer_target(
    session: Session,
    current: DeliveryDispatchRequest,
    target_id: uuid.UUID,
    now: datetime,
) -> DeliveryDispatchRequest | None:
    if target_id == current.id:
        if _live_offer(session, current.id, now) is not None:
            return None
        return current
    target = session.scalar(
        select(DeliveryDispatchRequest)
        .where(
            DeliveryDispatchRequest.id == target_id,
            DeliveryDispatchRequest.status.in_(tuple(_SEARCHABLE)),
        )
        .with_for_update(skip_locked=True)
    )
    if target is None:
        return None
    if _live_offer(session, target.id, now) is not None:
        return None
    return target


_LIVE_OFFER_CONSTRAINTS = frozenset(
    {
        "uq_delivery_dispatch_offers_one_offered_per_driver",
        "uq_delivery_dispatch_offers_one_offered_per_request",
    }
)


def _is_live_offer_conflict(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    if constraint in _LIVE_OFFER_CONSTRAINTS:
        return True
    return "uq_delivery_dispatch_offers_one_offered" in str(exc).lower()


def _compatible_live_offer(
    session: Session,
    request: DeliveryDispatchRequest,
    driver: DeliveryDriver,
) -> DeliveryDispatchOffer | None:
    live_request = _live_offer(session, request.id, datetime.now(UTC))
    if live_request is not None:
        return live_request if live_request.driver_id == driver.id else None
    live_driver = session.scalar(
        select(DeliveryDispatchOffer).where(
            DeliveryDispatchOffer.driver_id == driver.id,
            DeliveryDispatchOffer.status == "offered",
        )
    )
    if live_driver is not None and live_driver.request_id == request.id:
        return live_driver
    return None


def _persist_dispatch_offer(
    session: Session,
    request: DeliveryDispatchRequest,
    driver: DeliveryDriver,
    *,
    case: str,
    high_demand: bool,
    group_id: str | None,
    expires_at: datetime,
    keep_request_status: bool = False,
    extra_score: dict | None = None,
) -> DeliveryDispatchOffer | None:
    existing = _compatible_live_offer(session, request, driver)
    if existing is not None:
        return existing
    if _live_offer(session, request.id, datetime.now(UTC)) is not None:
        return None
    if (
        session.scalar(
            select(DeliveryDispatchOffer.id).where(
                DeliveryDispatchOffer.driver_id == driver.id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        is not None
    ):
        return None
    score_json: dict = {"case": case, "group_id": group_id}
    if extra_score:
        score_json.update(extra_score)
    offer = DeliveryDispatchOffer(
        request_id=request.id,
        driver_id=driver.id,
        status="offered",
        case_applied=case,
        expires_at=expires_at,
        score_json=score_json,
    )
    try:
        with session.begin_nested():
            session.add(offer)
            session.flush()
    except IntegrityError as exc:
        if not _is_live_offer_conflict(exc):
            raise
        return _compatible_live_offer(session, request, driver)
    if not keep_request_status:
        request.status = "offered"
    request.decision_json = {
        "case": case,
        "high_demand": high_demand,
        "driver_id": str(driver.id),
        "group_id": group_id,
        **(extra_score or {}),
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
        session=session,
    )
    name = driver.first_name
    if case == "M":
        record_assignment_event(
            session,
            request,
            kind="manual",
            tone="ok",
            title=manual_title(name),
            detail=offered_detail("M"),
            case_applied="M",
            driver_id=driver.id,
        )
    else:
        record_assignment_event(
            session,
            request,
            kind="offered",
            tone="ok",
            title=offered_title(name),
            detail=offered_detail(case),
            case_applied=case,
            driver_id=driver.id,
        )
    return offer


persist_dispatch_offer = _persist_dispatch_offer


def _enqueue_retry(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
    *,
    context: EngineContext | None = None,
    high_demand: bool = False,
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
        session=session,
    )
    detail = "No hay repartidores dados de alta."
    if context is not None:
        detail = searched_detail_from_context(context, high_demand=high_demand)
    record_assignment_event(
        session,
        request,
        kind="searched",
        tone="warn",
        title="Buscó rider",
        detail=detail,
        next_attempt_at=request.next_attempt_at,
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
        location_updated_at=(
            _as_utc(driver.location_updated_at) if driver.location_updated_at else None
        ),
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


def expire_stale_open_offers(session: Session, now: datetime) -> int:
    offers = list(
        session.scalars(
            select(DeliveryDispatchOffer)
            .where(
                DeliveryDispatchOffer.status == "offered",
                DeliveryDispatchOffer.expires_at <= now,
            )
            .with_for_update(skip_locked=True)
        ).all()
    )
    for offer in offers:
        offer.status = "expired"
        if offer.responded_at is None:
            offer.responded_at = now
        request = session.get(DeliveryDispatchRequest, offer.request_id)
        if request is None or request.status in _OCCUPIED:
            continue
        restore_status = None
        if offer.case_applied == "M" and isinstance(offer.score_json, dict):
            restore_status = offer.score_json.get("restore_status")
        if restore_status == "unassigned":
            request.status = "unassigned"
        elif request.status == "offered":
            request.status = "searching"
        notify_request_realtime(session, request)
        driver = session.get(DeliveryDriver, offer.driver_id)
        record_assignment_event(
            session,
            request,
            kind="expired",
            tone="warn",
            title=expired_title(driver.first_name if driver else None),
            detail="La oferta venció y ya no bloquea al rider.",
            driver_id=offer.driver_id,
        )
    return len(offers)


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
    del now
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
            record_assignment_event(
                session,
                member,
                kind="timed_out",
                tone="warn",
                title=timed_out_title(),
                detail=None,
            )


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
            session=session,
        )


def _driver_busy(
    session: Session,
    driver: DeliveryDriver,
    now: datetime,
    *,
    case: str,
    settings_row: DeliveryProviderAssignmentSettings,
) -> bool:
    del now
    open_offer = session.scalar(
        select(DeliveryDispatchOffer.id).where(
            DeliveryDispatchOffer.driver_id == driver.id,
            DeliveryDispatchOffer.status == "offered",
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
