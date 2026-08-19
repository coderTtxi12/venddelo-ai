from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime


_KIND_ORDER = {
    "requested": 0,
    "ready": 1,
    "search_started": 2,
    "offered": 3,
    "rejected": 4,
    "expired": 5,
    "closed": 6,
    "accepted": 7,
    "picked_up": 8,
    "in_transit": 9,
    "delivered": 10,
    "unassigned": 11,
    "cancelled": 12,
}


def _event_sort_key(event: TimelineEvent) -> tuple[int, float, int]:
    if event.at is None:
        return (1, 0.0, _KIND_ORDER.get(event.kind, 99))
    at = event.at if event.at.tzinfo is not None else event.at.replace(tzinfo=UTC)
    return (0, at.timestamp(), _KIND_ORDER.get(event.kind, 99))


@dataclass(frozen=True)
class TimelineOffer:
    created_at: datetime
    responded_at: datetime | None
    status: str
    driver_name: str
    case_applied: str


@dataclass(frozen=True)
class TimelineRequest:
    created_at: datetime
    ready_at: datetime
    search_at: datetime
    status: str
    cancelled_at: datetime | None = None
    picked_up_at: datetime | None = None
    in_transit_at: datetime | None = None
    delivered_at: datetime | None = None
    assigned_driver_name: str | None = None
    assignment_timeout_at: datetime | None = None


@dataclass(frozen=True)
class TimelineEvent:
    at: datetime | None
    kind: str
    driver_name: str | None = None
    case_applied: str | None = None
    current: bool = False


def build_operation_timeline(
    request: TimelineRequest,
    offers: list[TimelineOffer],
) -> list[TimelineEvent]:
    events: list[TimelineEvent] = [
        TimelineEvent(at=request.created_at, kind="requested"),
        TimelineEvent(at=request.search_at, kind="search_started"),
        TimelineEvent(at=request.ready_at, kind="ready"),
    ]

    accepted = any(offer.status == "accepted" for offer in offers)
    for offer in offers:
        events.append(
            TimelineEvent(
                at=offer.created_at,
                kind="offered",
                driver_name=offer.driver_name,
                case_applied=offer.case_applied,
                current=offer.status == "offered",
            )
        )
        if offer.status == "offered":
            continue
        outcome = offer.status
        if outcome == "expired" and accepted:
            outcome = "closed"
        events.append(
            TimelineEvent(
                at=offer.responded_at or offer.created_at,
                kind=outcome,
                driver_name=offer.driver_name,
                case_applied=offer.case_applied,
            )
        )

    if request.picked_up_at is not None:
        events.append(
            TimelineEvent(
                at=request.picked_up_at,
                kind="picked_up",
                driver_name=request.assigned_driver_name,
            )
        )
    if request.in_transit_at is not None:
        events.append(
            TimelineEvent(
                at=request.in_transit_at,
                kind="in_transit",
                driver_name=request.assigned_driver_name,
            )
        )
    if request.delivered_at is not None:
        events.append(
            TimelineEvent(
                at=request.delivered_at,
                kind="delivered",
                driver_name=request.assigned_driver_name,
            )
        )
    if request.status == "unassigned" and request.assignment_timeout_at is not None:
        events.append(
            TimelineEvent(at=request.assignment_timeout_at, kind="unassigned")
        )
    if request.cancelled_at is not None:
        events.append(TimelineEvent(at=request.cancelled_at, kind="cancelled"))

    events.sort(key=_event_sort_key)

    if request.status in {"picked_up", "in_transit"} and not any(
        event.kind == request.status for event in events
    ):
        events.append(
            TimelineEvent(
                at=None,
                kind=request.status,
                driver_name=request.assigned_driver_name,
            )
        )

    return _with_current(events, request.status)


_STATUS_CURRENT_KIND = {
    "scheduled": "requested",
    "searching": "search_started",
    "assigned": "accepted",
    "picked_up": "picked_up",
    "in_transit": "in_transit",
    "delivered": "delivered",
    "unassigned": "unassigned",
    "cancelled": "cancelled",
}


def _with_current(events: list[TimelineEvent], status: str) -> list[TimelineEvent]:
    if not events:
        return events
    if any(event.current for event in events):
        return events
    target = _STATUS_CURRENT_KIND.get(status)
    index = -1
    if target is not None:
        for i, event in enumerate(events):
            if event.kind == target or (status == "searching" and event.kind in {"offered", "rejected", "expired"}):
                index = i
    if index < 0:
        index = len(events) - 1
    chosen = events[index]
    events[index] = TimelineEvent(
        at=chosen.at,
        kind=chosen.kind,
        driver_name=chosen.driver_name,
        case_applied=chosen.case_applied,
        current=True,
    )
    return events
