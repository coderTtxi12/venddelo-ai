from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.modules.delivery_dispatch.engine import (
    EngineContext,
    EngineDriver,
    EngineRequest,
    EngineSettings,
    choose_assignments,
)

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
) -> EngineRequest:
    return EngineRequest(
        id=request_id,
        restaurant_lat=restaurant_lat,
        restaurant_lng=restaurant_lng,
        package_size=package_size,
        package_count=package_count,
        payment_method=payment_method,
        collect_cents=collect_cents,
        cycle_rejected_driver_ids=rejected,
        cycle_silent_driver_ids=silent,
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
) -> EngineDriver:
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
