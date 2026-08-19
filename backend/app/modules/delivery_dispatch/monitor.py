from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.models.delivery import (
    DeliveryCreditHold,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryProviderAssignmentSettings,
    DeliveryProviderZone,
)
from app.db.models.restaurant import Restaurant
from app.modules.delivery_dispatch.engine import (
    EngineContext,
    EngineDriver,
    EngineRequest,
    EngineSettings,
    eligibility_blockers,
    high_demand_breakdown,
    pre_free_eta_seconds,
)
from app.modules.delivery_dispatch.itinerary import hydrate_itinerary
from app.modules.delivery_dispatch.schemas import (
    DispatchMonitorCreditHoldDTO,
    DispatchMonitorDriverDTO,
    DispatchMonitorMetricsDTO,
    DispatchMonitorOfferDTO,
    DispatchMonitorRequestDTO,
    DispatchMonitorRouteDTO,
    DispatchMonitorSearchBlockerDTO,
    DispatchMonitorSnapshotDTO,
)

_ACTIVE_REQUEST_STATUSES = frozenset(
    {"scheduled", "searching", "offered", "assigned", "picked_up", "in_transit", "unassigned"}
)
_IN_PROGRESS_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})
_QUEUE_STATUSES = frozenset({"scheduled", "searching", "offered"})
_OCCUPIED_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _driver_name(driver: DeliveryDriver) -> str:
    return f"{driver.first_name} {driver.last_name}".strip()


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


def _to_engine_request(
    request: DeliveryDispatchRequest,
    restaurant: Restaurant | None,
) -> EngineRequest | None:
    if restaurant is None or restaurant.latitude is None or restaurant.longitude is None:
        return None
    return EngineRequest(
        id=str(request.id),
        restaurant_lat=restaurant.latitude,
        restaurant_lng=restaurant.longitude,
        package_size=request.package_size,
        package_count=request.package_count,
        payment_method=request.payment_method,
        collect_cents=request.collect_cents,
        dropoff_lat=request.dropoff_lat,
        dropoff_lng=request.dropoff_lng,
        status=request.status,
        cycle_rejected_driver_ids=tuple(str(item) for item in request.cycle_rejected_driver_ids),
        cycle_silent_driver_ids=tuple(str(item) for item in request.cycle_silent_driver_ids),
        dispatch_group_id=str(request.dispatch_group_id) if request.dispatch_group_id else None,
    )


def _search_blockers(
    context: EngineContext,
    request: EngineRequest,
) -> tuple[int, list[DispatchMonitorSearchBlockerDTO]]:
    counts: dict[str, int] = {}
    eligible = 0
    for driver in context.drivers:
        reasons = eligibility_blockers(context, request, driver)
        if not reasons:
            eligible += 1
            continue
        for reason in reasons:
            counts[reason] = counts.get(reason, 0) + 1
    return eligible, [DispatchMonitorSearchBlockerDTO(code=code, count=count) for code, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def _last_case(decision: object) -> str | None:
    if not isinstance(decision, dict):
        return None
    case = decision.get("case")
    if case is None:
        return None
    text = str(case).strip()
    return text or None


def _decision_driver_id(decision: object) -> uuid.UUID | None:
    if not isinstance(decision, dict):
        return None
    raw = decision.get("driver_id")
    if raw is None:
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        return None


def _last_accepted_driver_names(
    session: Session,
    request_ids: list[uuid.UUID],
) -> dict[uuid.UUID, str]:
    if not request_ids:
        return {}
    offers = session.scalars(
        select(DeliveryDispatchOffer)
        .where(
            DeliveryDispatchOffer.request_id.in_(request_ids),
            DeliveryDispatchOffer.status == "accepted",
        )
        .options(selectinload(DeliveryDispatchOffer.driver))
        .order_by(
            DeliveryDispatchOffer.responded_at.desc().nullslast(),
            DeliveryDispatchOffer.created_at.desc(),
        )
    ).all()
    names: dict[uuid.UUID, str] = {}
    for offer in offers:
        if offer.request_id in names or offer.driver is None:
            continue
        names[offer.request_id] = _driver_name(offer.driver)
    return names


def build_dispatch_monitor_snapshot(
    session: Session,
    provider_id: uuid.UUID,
    *,
    zone_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> DispatchMonitorSnapshotDTO:
    current = now or datetime.now(UTC)

    settings_row = session.scalar(
        select(DeliveryProviderAssignmentSettings).where(
            DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
        )
    )
    settings = _engine_settings(settings_row) if settings_row is not None else EngineSettings()
    staleness_seconds = settings.driver_location_staleness_seconds

    zone_names: dict[uuid.UUID, str] = {
        row.id: row.name
        for row in session.scalars(
            select(DeliveryProviderZone).where(
                DeliveryProviderZone.delivery_provider_id == provider_id
            )
        ).all()
    }

    drivers = list(
        session.scalars(
            select(DeliveryDriver).where(DeliveryDriver.delivery_provider_id == provider_id)
        ).all()
    )

    request_query = (
        select(DeliveryDispatchRequest)
        .where(
            DeliveryDispatchRequest.delivery_provider_id == provider_id,
            DeliveryDispatchRequest.status.in_(tuple(_ACTIVE_REQUEST_STATUSES)),
        )
        .options(selectinload(DeliveryDispatchRequest.assigned_driver))
        .order_by(DeliveryDispatchRequest.search_at.asc())
    )
    if zone_id is not None:
        request_query = request_query.where(DeliveryDispatchRequest.zone_id == zone_id)
    requests = list(session.scalars(request_query).all())

    restaurant_ids = {row.restaurant_id for row in requests}
    restaurants: dict[uuid.UUID, Restaurant] = {}
    if restaurant_ids:
        restaurants = {
            row.id: row
            for row in session.scalars(
                select(Restaurant).where(Restaurant.id.in_(restaurant_ids))
            ).all()
        }

    open_offers = list(
        session.scalars(
            select(DeliveryDispatchOffer)
            .join(
                DeliveryDispatchRequest,
                DeliveryDispatchOffer.request_id == DeliveryDispatchRequest.id,
            )
            .where(
                DeliveryDispatchRequest.delivery_provider_id == provider_id,
                DeliveryDispatchOffer.status == "offered",
                DeliveryDispatchOffer.expires_at > current,
            )
            .options(
                selectinload(DeliveryDispatchOffer.driver),
                selectinload(DeliveryDispatchOffer.request),
            )
        ).all()
    )
    if zone_id is not None:
        open_offers = [offer for offer in open_offers if offer.request.zone_id == zone_id]

    credit_holds = list(
        session.scalars(
            select(DeliveryCreditHold)
            .join(
                DeliveryDispatchRequest,
                DeliveryCreditHold.request_id == DeliveryDispatchRequest.id,
            )
            .where(
                DeliveryDispatchRequest.delivery_provider_id == provider_id,
                DeliveryCreditHold.status == "held",
            )
            .options(
                selectinload(DeliveryCreditHold.driver),
                selectinload(DeliveryCreditHold.request),
            )
        ).all()
    )
    if zone_id is not None:
        credit_holds = [hold for hold in credit_holds if hold.request.zone_id == zone_id]

    driver_active_requests: dict[uuid.UUID, list[DeliveryDispatchRequest]] = {
        driver.id: [] for driver in drivers
    }
    for request in requests:
        if request.assigned_driver_id is not None:
            driver_active_requests.setdefault(request.assigned_driver_id, []).append(request)

    open_offer_by_driver = {offer.driver_id: offer for offer in open_offers}

    driver_dtos: list[DispatchMonitorDriverDTO] = []
    engine_drivers: list[EngineDriver] = []
    drivers_online = 0
    drivers_offline = 0
    drivers_location_stale = 0
    drivers_credit_blocked = 0
    scratch_context = EngineContext(
        now=current,
        settings=settings,
        request=EngineRequest(
            id="monitor",
            restaurant_lat=0.0,
            restaurant_lng=0.0,
            package_size="normal",
            package_count=1,
            payment_method="transfer",
            collect_cents=0,
            dropoff_lat=0.0,
            dropoff_lng=0.0,
        ),
        due_siblings=(),
        drivers=(),
        pending_count=0,
    )

    for driver in drivers:
        if driver.status == "blocked":
            continue

        occupied = [
            job
            for job in driver_active_requests.get(driver.id, [])
            if job.status in _OCCUPIED_STATUSES
        ]
        active = None
        if len(occupied) == 1:
            active = occupied[0]
        elif occupied:
            active = next(
                (job for job in occupied if job.status == "in_transit"),
                occupied[0],
            )

        package_count = sum(job.package_count for job in occupied)
        open_offer = open_offer_by_driver.get(driver.id)
        available_cents = driver.credit_limit_cents - driver.credit_held_cents
        location_stale = True
        if (
            driver.is_online
            and driver.location_updated_at is not None
            and driver.last_lat is not None
            and driver.last_lng is not None
        ):
            age = (current - _as_utc(driver.location_updated_at)).total_seconds()
            location_stale = age > staleness_seconds

        credit_blocked = driver.is_online and available_cents <= 0 and driver.credit_held_cents > 0

        if driver.is_online:
            drivers_online += 1
        else:
            drivers_offline += 1
        if location_stale and driver.is_online:
            drivers_location_stale += 1
        if credit_blocked:
            drivers_credit_blocked += 1

        location_age_seconds = None
        if driver.location_updated_at is not None:
            location_age_seconds = max(
                0,
                int((current - _as_utc(driver.location_updated_at)).total_seconds()),
            )

        engine_driver = EngineDriver(
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
            active_package_count=package_count,
            has_open_offer=open_offer is not None,
            active_dropoff_lat=active.dropoff_lat if active is not None else None,
            active_dropoff_lng=active.dropoff_lng if active is not None else None,
            occupied_job_count=len(occupied),
        )
        engine_drivers.append(engine_driver)
        pre_free_eta = pre_free_eta_seconds(scratch_context, engine_driver)

        driver_dtos.append(
            DispatchMonitorDriverDTO(
                id=driver.id,
                first_name=driver.first_name,
                last_name=driver.last_name,
                phone=driver.phone,
                is_online=driver.is_online,
                status=driver.status,
                plate=driver.plate,
                motorcycle_color=driver.motorcycle_color,
                compartment_size=driver.compartment_size,
                profile_photo_path=driver.profile_photo_path,
                last_lat=driver.last_lat,
                last_lng=driver.last_lng,
                location_updated_at=driver.location_updated_at,
                location_stale=location_stale,
                location_age_seconds=location_age_seconds,
                credit_limit_cents=driver.credit_limit_cents,
                credit_held_cents=driver.credit_held_cents,
                credit_available_cents=available_cents,
                credit_blocked=credit_blocked,
                active_request_id=active.id if active is not None else None,
                active_request_status=active.status if active is not None else None,
                open_offer_id=open_offer.id if open_offer is not None else None,
                is_pre_free=pre_free_eta is not None,
                pre_free_eta_seconds=pre_free_eta,
                occupied_job_count=len(occupied),
                active_package_count=package_count,
                itinerary=hydrate_itinerary(session, driver.id),
            )
        )

    request_dtos: list[DispatchMonitorRequestDTO] = []
    routes: list[DispatchMonitorRouteDTO] = []
    requests_due_search = 0
    requests_in_progress = 0
    driver_names = {driver.id: _driver_name(driver) for driver in drivers}
    last_accepted_names = _last_accepted_driver_names(session, [row.id for row in requests])

    for request in requests:
        restaurant = restaurants.get(request.restaurant_id)
        restaurant_name = restaurant.name if restaurant is not None else "Restaurante"
        restaurant_lat = restaurant.latitude if restaurant is not None else None
        restaurant_lng = restaurant.longitude if restaurant is not None else None
        is_due_search = (
            request.status in _QUEUE_STATUSES and _as_utc(request.search_at) <= current
        )
        if is_due_search:
            requests_due_search += 1
        if request.status in _IN_PROGRESS_STATUSES:
            requests_in_progress += 1

        assigned_name = None
        if request.assigned_driver is not None:
            assigned_name = _driver_name(request.assigned_driver)

        last_assigned_name = assigned_name or last_accepted_names.get(request.id)
        if last_assigned_name is None:
            decision_driver_id = _decision_driver_id(request.decision_json)
            if decision_driver_id is not None:
                last_assigned_name = driver_names.get(decision_driver_id)

        engine_request = _to_engine_request(request, restaurant)
        eligible_count = 0
        blockers: list[DispatchMonitorSearchBlockerDTO] = []
        if engine_request is not None:
            request_context = EngineContext(
                now=current,
                settings=settings,
                request=engine_request,
                due_siblings=(),
                drivers=tuple(engine_drivers),
                pending_count=0,
            )
            eligible_count, blockers = _search_blockers(request_context, engine_request)

        search_at = _as_utc(request.search_at)
        timeout_at = search_at + timedelta(seconds=settings.assignment_timeout_seconds)
        decision = request.decision_json if isinstance(request.decision_json, dict) else None

        request_dtos.append(
            DispatchMonitorRequestDTO(
                id=request.id,
                short_id=request.short_id,
                status=request.status,
                customer_name=request.customer_name,
                customer_phone=request.customer_phone,
                restaurant_name=restaurant_name,
                restaurant_lat=restaurant_lat,
                restaurant_lng=restaurant_lng,
                dropoff_lat=request.dropoff_lat,
                dropoff_lng=request.dropoff_lng,
                dropoff_address=request.dropoff_address,
                payment_method=request.payment_method,
                collect_cents=request.collect_cents,
                cash_denomination_cents=request.cash_denomination_cents,
                search_at=request.search_at,
                ready_at=request.ready_at,
                next_attempt_at=request.next_attempt_at,
                assignment_timeout_at=timeout_at,
                is_due_search=is_due_search,
                assigned_driver_id=request.assigned_driver_id,
                assigned_driver_name=assigned_name,
                last_assigned_driver_name=last_assigned_name,
                dispatch_group_id=request.dispatch_group_id,
                zone_name=zone_names.get(request.zone_id),
                package_size=request.package_size,
                package_count=request.package_count,
                quoted_fee_cents=request.quoted_fee_cents,
                notes=request.notes,
                last_case=_last_case(decision),
                last_decision=decision,
                eligible_driver_count=eligible_count,
                search_blockers=blockers,
                cycle_rejected_count=len(request.cycle_rejected_driver_ids),
                cycle_silent_count=len(request.cycle_silent_driver_ids),
            )
        )

        if (
            request.status in _IN_PROGRESS_STATUSES
            and request.assigned_driver_id is not None
            and request.assigned_driver is not None
            and request.assigned_driver.last_lat is not None
            and request.assigned_driver.last_lng is not None
        ):
            if request.status == "assigned":
                if restaurant_lat is None or restaurant_lng is None:
                    continue
                origin_lat = request.assigned_driver.last_lat
                origin_lng = request.assigned_driver.last_lng
                origin_label = assigned_name or "Repartidor"
                destination_lat = restaurant_lat
                destination_lng = restaurant_lng
                destination_label = restaurant_name
            else:
                origin_lat = request.assigned_driver.last_lat
                origin_lng = request.assigned_driver.last_lng
                origin_label = assigned_name or "Repartidor"
                destination_lat = request.dropoff_lat
                destination_lng = request.dropoff_lng
                destination_label = request.dropoff_address

            routes.append(
                DispatchMonitorRouteDTO(
                    request_id=request.id,
                    short_id=request.short_id,
                    driver_id=request.assigned_driver_id,
                    driver_name=assigned_name or "Repartidor",
                    status=request.status,
                    origin_lat=origin_lat,
                    origin_lng=origin_lng,
                    origin_label=origin_label,
                    destination_lat=destination_lat,
                    destination_lng=destination_lng,
                    destination_label=destination_label,
                )
            )

    offer_dtos: list[DispatchMonitorOfferDTO] = []
    for offer in open_offers:
        request = offer.request
        restaurant = restaurants.get(request.restaurant_id)
        offer_dtos.append(
            DispatchMonitorOfferDTO(
                id=offer.id,
                request_id=offer.request_id,
                short_id=request.short_id,
                driver_id=offer.driver_id,
                driver_name=_driver_name(offer.driver),
                status=offer.status,
                case_applied=offer.case_applied,
                expires_at=offer.expires_at,
                customer_name=request.customer_name,
                restaurant_name=restaurant.name if restaurant is not None else "Restaurante",
                dropoff_address=request.dropoff_address,
                score_json=offer.score_json if isinstance(offer.score_json, dict) else None,
            )
        )

    hold_dtos: list[DispatchMonitorCreditHoldDTO] = []
    for hold in credit_holds:
        request = hold.request
        restaurant = restaurants.get(request.restaurant_id)
        hold_dtos.append(
            DispatchMonitorCreditHoldDTO(
                id=hold.id,
                driver_id=hold.driver_id,
                driver_name=_driver_name(hold.driver),
                request_id=hold.request_id,
                short_id=request.short_id,
                amount_cents=hold.amount_cents,
                status=hold.status,
                customer_name=request.customer_name,
                restaurant_name=restaurant.name if restaurant is not None else "Restaurante",
            )
        )

    pending_count = session.scalar(
        select(func.count())
        .select_from(DeliveryDispatchRequest)
        .where(
            DeliveryDispatchRequest.delivery_provider_id == provider_id,
            DeliveryDispatchRequest.status.in_(("scheduled", "searching", "offered")),
        )
    )
    high_demand = False
    few_free = False
    high_occupancy = False
    large_queue = False
    free_count = 0
    occupied_ratio = 0.0
    if engine_drivers and requests:
        anchor = requests[0]
        restaurant = restaurants.get(anchor.restaurant_id)
        engine_request = _to_engine_request(anchor, restaurant)
        if engine_request is not None:
            context = EngineContext(
                now=current,
                settings=settings,
                request=engine_request,
                drivers=tuple(engine_drivers),
                due_siblings=tuple(),
                pending_count=int(pending_count or 0),
            )
            breakdown = high_demand_breakdown(context)
            high_demand = breakdown.high_demand
            few_free = breakdown.few_free
            high_occupancy = breakdown.high_occupancy
            large_queue = breakdown.large_queue
            free_count = breakdown.free_count
            occupied_ratio = breakdown.occupied_ratio

    requests_unassigned = sum(1 for row in request_dtos if row.status == "unassigned")
    metrics = DispatchMonitorMetricsDTO(
        drivers_online=drivers_online,
        drivers_offline=drivers_offline,
        drivers_location_stale=drivers_location_stale,
        requests_pending=int(pending_count or 0),
        requests_due_search=requests_due_search,
        requests_in_progress=requests_in_progress,
        offers_open=len(offer_dtos),
        credit_holds_active=len(hold_dtos),
        drivers_credit_blocked=drivers_credit_blocked,
        high_demand=high_demand,
        requests_unassigned=requests_unassigned,
        high_demand_few_free=few_free,
        high_demand_high_occupancy=high_occupancy,
        high_demand_large_queue=large_queue,
        high_demand_free_count=free_count,
        high_demand_occupied_ratio=occupied_ratio,
        assignment_timeout_seconds=settings.assignment_timeout_seconds,
        offer_timeout_seconds=(
            settings_row.offer_timeout_seconds if settings_row is not None else 45
        ),
        assignment_retry_seconds=(
            settings_row.assignment_retry_seconds if settings_row is not None else 30
        ),
        max_active_packages_per_driver=settings.max_active_packages_per_driver,
        tasks_backend=get_settings().delivery_tasks_backend,
    )

    return DispatchMonitorSnapshotDTO(
        generated_at=current,
        metrics=metrics,
        drivers=driver_dtos,
        requests=request_dtos,
        offers=offer_dtos,
        credit_holds=hold_dtos,
        routes=routes,
    )
