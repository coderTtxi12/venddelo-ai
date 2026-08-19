from datetime import UTC, datetime

from app.modules.delivery_dispatch.timeline import (
    TimelineOffer,
    TimelineRequest,
    build_operation_timeline,
)


def _at(minute: int, second: int = 0) -> datetime:
    return datetime(2026, 8, 18, 20, minute, second, tzinfo=UTC)


def test_timeline_orders_request_search_and_rejections():
    request = TimelineRequest(
        created_at=_at(1),
        search_at=_at(3),
        ready_at=_at(8),
        status="searching",
    )
    offers = [
        TimelineOffer(
            created_at=_at(3, 10),
            responded_at=_at(3, 40),
            status="rejected",
            driver_name="Ana Pérez",
            case_applied="A",
        ),
        TimelineOffer(
            created_at=_at(3, 41),
            responded_at=_at(4, 10),
            status="expired",
            driver_name="Luis Soto",
            case_applied="A",
        ),
        TimelineOffer(
            created_at=_at(4, 11),
            responded_at=None,
            status="offered",
            driver_name="María López",
            case_applied="B",
        ),
    ]

    events = build_operation_timeline(request, offers)
    kinds = [(event.kind, event.driver_name) for event in events]
    assert kinds == [
        ("requested", None),
        ("search_started", None),
        ("offered", "Ana Pérez"),
        ("rejected", "Ana Pérez"),
        ("offered", "Luis Soto"),
        ("expired", "Luis Soto"),
        ("offered", "María López"),
        ("ready", None),
    ]
    current = [event for event in events if event.current]
    assert len(current) == 1
    assert current[0].kind == "offered"
    assert current[0].driver_name == "María López"


def test_expired_offer_is_closed_when_another_driver_accepted():
    request = TimelineRequest(
        created_at=_at(1),
        search_at=_at(1),
        ready_at=_at(5),
        status="assigned",
        assigned_driver_name="María López",
    )
    offers = [
        TimelineOffer(
            created_at=_at(1, 5),
            responded_at=_at(1, 20),
            status="expired",
            driver_name="Ana Pérez",
            case_applied="A",
        ),
        TimelineOffer(
            created_at=_at(1, 5),
            responded_at=_at(1, 20),
            status="accepted",
            driver_name="María López",
            case_applied="A",
        ),
    ]
    kinds = [event.kind for event in build_operation_timeline(request, offers)]
    assert "closed" in kinds
    assert "expired" not in kinds
    assert "accepted" in kinds
    current = [event for event in build_operation_timeline(request, offers) if event.current]
    assert current[0].kind == "accepted"


def test_unassigned_and_missing_pickup_time():
    timeout = _at(16)
    request = TimelineRequest(
        created_at=_at(1),
        search_at=_at(1),
        ready_at=_at(5),
        status="unassigned",
        assignment_timeout_at=timeout,
    )
    events = build_operation_timeline(request, [])
    assert events[-1].kind == "unassigned"
    assert events[-1].at == timeout
    assert events[-1].current is True

    in_progress = TimelineRequest(
        created_at=_at(1),
        search_at=_at(1),
        ready_at=_at(5),
        status="picked_up",
        assigned_driver_name="Ana Pérez",
        picked_up_at=None,
    )
    later = build_operation_timeline(in_progress, [])
    assert later[-1].kind == "picked_up"
    assert later[-1].at is None
    assert later[-1].current is True


def test_pickup_and_transit_use_stored_timestamps():
    request = TimelineRequest(
        created_at=_at(1),
        search_at=_at(1),
        ready_at=_at(5),
        status="in_transit",
        assigned_driver_name="Ana Pérez",
        picked_up_at=_at(12),
        in_transit_at=_at(13),
    )
    kinds = [event.kind for event in build_operation_timeline(request, [])]
    assert kinds[-2:] == ["picked_up", "in_transit"]
    assert all(event.at is not None for event in build_operation_timeline(request, [])[-2:])
