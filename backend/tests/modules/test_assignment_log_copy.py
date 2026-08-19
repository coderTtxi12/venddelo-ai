from datetime import datetime, timedelta, timezone

from app.modules.delivery_dispatch.assignment_log import (
    driver_display_name,
    expired_title,
    manual_title,
    offered_detail,
    offered_title,
    rejected_title,
    searched_detail,
    searched_detail_from_context,
    timed_out_title,
)
from app.modules.delivery_dispatch.engine import (
    EngineContext,
    EngineDriver,
    EngineRequest,
    EngineSettings,
)

NOW = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)


def test_driver_display_name_falls_back() -> None:
    assert driver_display_name("Luis") == "Luis"
    assert driver_display_name("  ") == "repartidor"
    assert driver_display_name(None) == "repartidor"


def test_searched_detail_no_drivers() -> None:
    assert searched_detail(
        driver_count=0, eligible_count=0, blocker_counts={}, high_demand=False
    ) == "No hay repartidores dados de alta."


def test_searched_detail_blockers_and_high_demand() -> None:
    text = searched_detail(
        driver_count=3,
        eligible_count=0,
        blocker_counts={"offline": 2, "gps": 1},
        high_demand=True,
    )
    assert text == "Nadie elegible: 2 offline, 1 GPS viejo · alta demanda"


def test_searched_detail_eligible_but_no_offer() -> None:
    assert searched_detail(
        driver_count=4,
        eligible_count=2,
        blocker_counts={"offline": 2},
        high_demand=False,
    ) == "Había riders, pero el motor no soltó oferta (reserva de libres)."


def test_offer_copy() -> None:
    assert offered_title("Luis") == "Ofertó a Luis"
    assert offered_detail("A") == "El más cercano al restaurante"
    assert offered_detail("B") == "Varios pedidos listos · riders en paralelo"
    assert offered_detail("C") == "Alta demanda · entregas cercanas, un rider"
    assert offered_detail("D") == "Alta demanda · rider que ya iba de camino"
    assert offered_detail("M") == "Asignación manual desde el monitor"
    assert expired_title("Luis") == "Luis no respondió"
    assert rejected_title("Luis") == "Luis rechazó"
    assert manual_title("Luis") == "Oferta enviada a mano a Luis"
    assert timed_out_title() == "Se agotó la búsqueda"


def _context(drivers: tuple[EngineDriver, ...]) -> EngineContext:
    request = EngineRequest(
        id="req-1",
        restaurant_lat=19.4326,
        restaurant_lng=-99.1332,
        package_size="normal",
        package_count=1,
        payment_method="transfer",
        collect_cents=0,
        dropoff_lat=19.4326,
        dropoff_lng=-99.1332,
    )
    return EngineContext(
        now=NOW,
        settings=EngineSettings(),
        request=request,
        due_siblings=(),
        drivers=drivers,
        pending_count=0,
    )


def _driver(
    driver_id: str,
    *,
    is_online: bool,
    location_updated_at: datetime | None = NOW,
) -> EngineDriver:
    return EngineDriver(
        id=driver_id,
        status="active",
        is_online=is_online,
        last_lat=19.4326,
        last_lng=-99.1332,
        location_updated_at=location_updated_at,
        credit_limit_cents=50_000,
        credit_held_cents=0,
        compartment_size="normal",
    )


def test_searched_detail_from_context_no_drivers() -> None:
    assert (
        searched_detail_from_context(_context(()), high_demand=False)
        == "No hay repartidores dados de alta."
    )


def test_searched_detail_from_context_blockers_and_high_demand() -> None:
    drivers = (
        _driver("d1", is_online=False),
        _driver("d2", is_online=False),
        _driver("d3", is_online=True, location_updated_at=NOW - timedelta(seconds=200)),
    )
    text = searched_detail_from_context(_context(drivers), high_demand=True)
    assert text == "Nadie elegible: 2 offline, 1 GPS viejo · alta demanda"


def test_record_assignment_event_signature_imports() -> None:
    from app.modules.delivery_dispatch.assignment_log import record_assignment_event

    assert callable(record_assignment_event)
