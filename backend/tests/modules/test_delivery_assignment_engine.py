from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.modules.delivery_dispatch.engine import (
    EngineContext,
    EngineDriver,
    EngineRequest,
    EngineSettings,
    choose_assignments,
    eligibility_blockers,
    high_demand_breakdown,
)
from app.modules.delivery_dispatch.geo import geodesic_meters

NOW = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
RESTAURANT_LAT = 19.4326
RESTAURANT_LNG = -99.1332


def _settings(**overrides) -> EngineSettings:
    values = dict(
        driver_location_staleness_seconds=90,
        min_protected_drivers=2,
        high_demand_available_drivers_max=0,
        high_demand_occupied_ratio=0.80,
        high_demand_pending_min=5,
        max_active_packages_per_driver=3,
    )
    values.update(overrides)
    return EngineSettings(**values)


def _request(
    request_id: str = "req-1",
    *,
    package_size: str = "normal",
    package_count: int = 1,
    payment_method: str = "transfer",
    collect_cents: int = 0,
    rejected: tuple[str, ...] = (),
    silent: tuple[str, ...] = (),
    restaurant_lat: float = RESTAURANT_LAT,
    restaurant_lng: float = RESTAURANT_LNG,
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
    dispatch_group_id: str | None = None,
) -> EngineRequest:
    return EngineRequest(
        id=request_id,
        restaurant_lat=restaurant_lat,
        restaurant_lng=restaurant_lng,
        dropoff_lat=restaurant_lat if dropoff_lat is None else dropoff_lat,
        dropoff_lng=restaurant_lng if dropoff_lng is None else dropoff_lng,
        package_size=package_size,
        package_count=package_count,
        payment_method=payment_method,
        collect_cents=collect_cents,
        cycle_rejected_driver_ids=rejected,
        cycle_silent_driver_ids=silent,
        dispatch_group_id=dispatch_group_id,
    )


def _driver(
    driver_id: str,
    *,
    last_lat: float,
    last_lng: float,
    location_updated_at: datetime | None = None,
    status: str = "active",
    is_online: bool = True,
    credit_limit_cents: int = 50_000,
    credit_held_cents: int = 0,
    compartment_size: str = "normal",
    active_request_status: str | None = None,
    active_package_count: int = 0,
    has_open_offer: bool = False,
    active_dropoff_lat: float | None = None,
    active_dropoff_lng: float | None = None,
    occupied_job_count: int | None = None,
) -> EngineDriver:
    occupied = occupied_job_count
    if occupied is None:
        occupied = 1 if active_request_status in {"assigned", "picked_up", "in_transit"} else 0
    return EngineDriver(
        id=driver_id,
        status=status,
        is_online=is_online,
        last_lat=last_lat,
        last_lng=last_lng,
        location_updated_at=location_updated_at if location_updated_at is not None else NOW,
        credit_limit_cents=credit_limit_cents,
        credit_held_cents=credit_held_cents,
        compartment_size=compartment_size,
        active_request_status=active_request_status,
        active_package_count=active_package_count,
        has_open_offer=has_open_offer,
        active_dropoff_lat=active_dropoff_lat,
        active_dropoff_lng=active_dropoff_lng,
        occupied_job_count=occupied,
    )


def _context(
    request: EngineRequest,
    drivers: tuple[EngineDriver, ...],
    *,
    due_siblings: tuple[EngineRequest, ...] | None = None,
    settings: EngineSettings | None = None,
    pending_count: int | None = None,
) -> EngineContext:
    siblings = due_siblings if due_siblings is not None else (request,)
    return EngineContext(
        now=NOW,
        settings=settings or _settings(),
        request=request,
        due_siblings=siblings,
        drivers=drivers,
        pending_count=pending_count if pending_count is not None else len(siblings),
    )


def test_case_a_picks_nearest_to_restaurant():
    request = _request()
    near = _driver("near", last_lat=19.4330, last_lng=-99.1335)
    far = _driver("far", last_lat=19.4500, last_lng=-99.1600)
    result = choose_assignments(_context(request, (far, near)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "near"
    assert result.offers[0].request_id == "req-1"


def test_stale_gps_excluded():
    request = _request()
    stale = _driver(
        "stale",
        last_lat=19.4330,
        last_lng=-99.1335,
        location_updated_at=NOW - timedelta(seconds=91),
    )
    fresh = _driver("fresh", last_lat=19.4400, last_lng=-99.1400)
    result = choose_assignments(_context(request, (stale, fresh)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "fresh"


def test_grande_excludes_normal_compartment():
    request = _request(package_size="grande")
    normal = _driver("normal", last_lat=19.4330, last_lng=-99.1335, compartment_size="normal")
    grande = _driver("grande", last_lat=19.4400, last_lng=-99.1400, compartment_size="grande")
    result = choose_assignments(_context(request, (normal, grande)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "grande"


def test_cash_excludes_insufficient_credit():
    request = _request(payment_method="cash", collect_cents=20_000)
    poor = _driver(
        "poor",
        last_lat=19.4330,
        last_lng=-99.1335,
        credit_limit_cents=50_000,
        credit_held_cents=40_000,
    )
    rich = _driver(
        "rich",
        last_lat=19.4400,
        last_lng=-99.1400,
        credit_limit_cents=50_000,
        credit_held_cents=0,
    )
    result = choose_assignments(_context(request, (poor, rich)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "rich"


def test_case_b_protects_min_drivers():
    current = _request("req-1")
    sibling = _request("req-2")
    drivers = (
        _driver("d1", last_lat=19.4330, last_lng=-99.1335),
        _driver("d2", last_lat=19.4340, last_lng=-99.1340),
        _driver("d3", last_lat=19.4350, last_lng=-99.1350),
    )
    result = choose_assignments(
        _context(
            current,
            drivers,
            due_siblings=(current, sibling),
            settings=_settings(min_protected_drivers=2, high_demand_available_drivers_max=0),
        )
    )

    assert result.case == "B"
    assert len(result.offers) == 1
    assert result.offers[0].request_id == "req-1"


def test_high_demand_returns_no_offers():
    request = _request()
    drivers = (
        _driver("d1", last_lat=19.4330, last_lng=-99.1335),
        _driver("d2", last_lat=19.4340, last_lng=-99.1340),
    )
    result = choose_assignments(
        _context(
            request,
            drivers,
            settings=_settings(high_demand_available_drivers_max=2),
        )
    )

    assert result.high_demand is True
    assert result.offers == ()
    assert result.case is None


def test_rejected_driver_is_not_offered():
    request = _request(rejected=("near",))
    near = _driver("near", last_lat=19.4330, last_lng=-99.1335)
    far = _driver("far", last_lat=19.4400, last_lng=-99.1400)
    result = choose_assignments(_context(request, (near, far)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "far"


def test_silent_driver_is_not_offered_this_cycle():
    request = _request(silent=("near",))
    near = _driver("near", last_lat=19.4330, last_lng=-99.1335)
    far = _driver("far", last_lat=19.4400, last_lng=-99.1400)
    result = choose_assignments(_context(request, (near, far)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "far"


def test_pre_free_in_transit_within_eta_counts_as_free_for_a():
    dropoff_lat, dropoff_lng = 19.4330, -99.1335
    request = _request()
    almost_done = _driver(
        "almost-done",
        last_lat=dropoff_lat,
        last_lng=dropoff_lng,
        active_request_status="in_transit",
        active_package_count=1,
        active_dropoff_lat=dropoff_lat,
        active_dropoff_lng=dropoff_lng,
    )
    eta_seconds = geodesic_meters(
        dropoff_lat, dropoff_lng, dropoff_lat, dropoff_lng
    ) / 8
    assert eta_seconds <= 60

    result = choose_assignments(_context(request, (almost_done,)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "almost-done"
    assert result.offers[0].request_id == "req-1"


def test_stale_gps_excluded_even_if_in_transit():
    dropoff_lat, dropoff_lng = 19.4330, -99.1335
    request = _request()
    stale_pre_free = _driver(
        "stale-pre-free",
        last_lat=dropoff_lat,
        last_lng=dropoff_lng,
        location_updated_at=NOW - timedelta(seconds=91),
        active_request_status="in_transit",
        active_package_count=1,
        active_dropoff_lat=dropoff_lat,
        active_dropoff_lng=dropoff_lng,
    )
    fresh = _driver("fresh", last_lat=19.4400, last_lng=-99.1400)
    result = choose_assignments(_context(request, (stale_pre_free, fresh)))

    assert result.case == "A"
    assert result.offers[0].driver_id == "fresh"


def test_case_c_groups_nearby_dropoffs_onto_one_driver():
    current = _request("req-1", dropoff_lat=19.4326, dropoff_lng=-99.1332)
    sibling = _request("req-2", dropoff_lat=19.4340, dropoff_lng=-99.1332)
    nearby_m = geodesic_meters(19.4326, -99.1332, 19.4340, -99.1332)
    assert nearby_m <= 800

    driver = _driver("only", last_lat=19.4330, last_lng=-99.1335)
    result = choose_assignments(
        _context(
            current,
            (driver,),
            due_siblings=(current, sibling),
            settings=_settings(high_demand_available_drivers_max=2),
        )
    )

    assert result.high_demand is True
    assert result.case == "C"
    assert len(result.offers) == 2
    assert {offer.driver_id for offer in result.offers} == {"only"}
    assert {offer.request_id for offer in result.offers} == {"req-1", "req-2"}
    assert result.group_id is not None
    assert all(offer.group_id == result.group_id for offer in result.offers)


def test_case_c_without_free_rider_falls_through_to_d():
    current = _request("req-1", dropoff_lat=19.4326, dropoff_lng=-99.1332)
    sibling = _request("req-2", dropoff_lat=19.4340, dropoff_lng=-99.1332)
    nearby_m = geodesic_meters(19.4326, -99.1332, 19.4340, -99.1332)
    assert nearby_m <= 800

    on_route = _driver(
        "on-route",
        last_lat=19.4330,
        last_lng=-99.1335,
        active_request_status="picked_up",
        active_package_count=1,
        active_dropoff_lat=19.4340,
        active_dropoff_lng=-99.1332,
    )
    result = choose_assignments(
        _context(
            current,
            (on_route,),
            due_siblings=(current, sibling),
            settings=_settings(high_demand_available_drivers_max=2),
        )
    )

    assert result.high_demand is True
    assert result.case == "D"
    assert len(result.offers) == 1
    assert result.offers[0].driver_id == "on-route"
    assert result.offers[0].request_id == "req-1"


def test_case_c_skips_siblings_already_in_live_group():
    live_group = "live-group-1"
    current = _request("req-3", dropoff_lat=19.4326, dropoff_lng=-99.1332)
    grouped_a = _request(
        "req-1",
        dropoff_lat=19.4330,
        dropoff_lng=-99.1332,
        dispatch_group_id=live_group,
    )
    grouped_b = _request(
        "req-2",
        dropoff_lat=19.4340,
        dropoff_lng=-99.1332,
        dispatch_group_id=live_group,
    )
    nearby_m = geodesic_meters(19.4326, -99.1332, 19.4340, -99.1332)
    assert nearby_m <= 800

    driver = _driver("only", last_lat=19.4330, last_lng=-99.1335)
    result = choose_assignments(
        _context(
            current,
            (driver,),
            due_siblings=(current, grouped_a, grouped_b),
            settings=_settings(high_demand_available_drivers_max=2),
        )
    )

    offered_ids = {offer.request_id for offer in result.offers}
    assert "req-1" not in offered_ids
    assert "req-2" not in offered_ids
    assert result.case != "C"


def test_case_d_discards_driver_over_detour_threshold():
    request = _request("req-1", dropoff_lat=19.4326, dropoff_lng=-99.1332)
    near_dropoff_lat, near_dropoff_lng = 19.4340, -99.1332
    ok_driver = _driver(
        "ok-on-route",
        last_lat=19.4330,
        last_lng=-99.1335,
        active_request_status="picked_up",
        active_package_count=1,
        active_dropoff_lat=near_dropoff_lat,
        active_dropoff_lng=near_dropoff_lng,
    )
    far_driver = _driver(
        "far-on-route",
        last_lat=19.50,
        last_lng=-99.20,
        active_request_status="in_transit",
        active_package_count=1,
        active_dropoff_lat=19.50,
        active_dropoff_lng=-99.20,
    )
    pickup_minutes = (
        geodesic_meters(19.50, -99.20, RESTAURANT_LAT, RESTAURANT_LNG) / 8 / 60
    )
    assert pickup_minutes > 8

    result = choose_assignments(
        _context(
            request,
            (far_driver, ok_driver),
            settings=_settings(high_demand_available_drivers_max=2),
        )
    )

    assert result.high_demand is True
    assert result.case == "D"
    assert len(result.offers) == 1
    assert result.offers[0].driver_id == "ok-on-route"
    assert result.offers[0].request_id == "req-1"


def test_assignment_times_out_at_search_at_plus_timeout():
    from app.modules.delivery_dispatch.engine import assignment_timed_out

    search_at = NOW
    assert assignment_timed_out(NOW + timedelta(seconds=899), search_at, 900) is False
    assert assignment_timed_out(NOW + timedelta(seconds=900), search_at, 900) is True


def test_notify_offer_skips_without_fcm_token():
    from types import SimpleNamespace

    from app.modules.delivery_dispatch.notify import notify_offer, set_offer_notifier

    seen: list[object] = []
    set_offer_notifier(lambda driver, offer: seen.append(offer))
    try:
        notify_offer(SimpleNamespace(fcm_token=None), SimpleNamespace(id="offer-1"))
        notify_offer(SimpleNamespace(fcm_token=""), SimpleNamespace(id="offer-2"))
        assert seen == []
    finally:
        set_offer_notifier(None)


def test_notify_offer_records_when_token_present():
    from types import SimpleNamespace

    from app.modules.delivery_dispatch.notify import notify_offer, set_offer_notifier

    seen: list[str] = []
    set_offer_notifier(lambda driver, offer: seen.append(offer.id))
    try:
        notify_offer(SimpleNamespace(fcm_token="token-abc"), SimpleNamespace(id="offer-1"))
        assert seen == ["offer-1"]
    finally:
        set_offer_notifier(None)


def test_high_demand_breakdown_flags_large_queue():
    request = _request()
    driver = _driver("d1", last_lat=19.4330, last_lng=-99.1335)
    breakdown = high_demand_breakdown(
        _context(request, (driver,), settings=_settings(high_demand_available_drivers_max=5), pending_count=8)
    )
    assert breakdown.large_queue is True
    assert breakdown.high_demand is True


def test_eligibility_blockers_offline_and_gps():
    request = _request()
    offline = _driver("off", last_lat=19.4330, last_lng=-99.1335, is_online=False)
    context = _context(request, (offline,))
    assert "offline" in eligibility_blockers(context, request, offline)
