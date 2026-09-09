from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from app.core.exceptions import ValidationError


@dataclass(frozen=True)
class BusyInterval:
    driver_id: uuid.UUID
    request_id: uuid.UUID
    start: datetime
    end: datetime
    grouped: bool = False


def normalize_customer_phone(raw: str | None) -> str:
    if not raw:
        return ""
    return "".join(ch for ch in raw if ch.isdigit())


def _day_count(start: date, end: date) -> int:
    return (end - start).days + 1


def require_same_length(
    start: date,
    end: date,
    compare_start: date,
    compare_end: date,
) -> tuple[date, date]:
    expected = _day_count(start, end)
    if _day_count(compare_start, compare_end) != expected:
        raise ValidationError(
            f"El periodo a comparar debe durar lo mismo ({expected} días)."
        )
    return compare_start, compare_end


def _clip(
    interval: BusyInterval,
    window_start: datetime,
    window_end: datetime,
) -> tuple[datetime, datetime] | None:
    start = max(interval.start, window_start)
    end = min(interval.end, window_end)
    if start >= end:
        return None
    return start, end


def _in_window(interval: BusyInterval, window_start: datetime, window_end: datetime) -> bool:
    return interval.start <= window_end and interval.end >= window_start


def peak_occupancy(
    intervals: list[BusyInterval],
    window_start: datetime,
    window_end: datetime,
) -> int:
    events: list[tuple[datetime, int, uuid.UUID]] = []
    for interval in intervals:
        clipped = _clip(interval, window_start, window_end)
        if clipped is None:
            continue
        start, end = clipped
        events.append((start, 1, interval.driver_id))
        events.append((end, -1, interval.driver_id))
    events.sort(key=lambda item: (item[0], item[1]))
    open_counts: dict[uuid.UUID, int] = {}
    peak = 0
    for _, delta, driver_id in events:
        open_counts[driver_id] = open_counts.get(driver_id, 0) + delta
        if open_counts[driver_id] <= 0:
            open_counts.pop(driver_id, None)
        peak = max(peak, len(open_counts))
    return peak


def routed_request_ids(
    intervals: list[BusyInterval],
    window_start: datetime,
    window_end: datetime,
) -> set[uuid.UUID]:
    routed: set[uuid.UUID] = set()
    by_driver: dict[uuid.UUID, list[tuple[datetime, datetime, uuid.UUID]]] = defaultdict(list)
    for interval in intervals:
        if interval.grouped and _in_window(interval, window_start, window_end):
            routed.add(interval.request_id)
        clipped = _clip(interval, window_start, window_end)
        if clipped is None:
            continue
        start, end = clipped
        by_driver[interval.driver_id].append((start, end, interval.request_id))
    for items in by_driver.values():
        items.sort()
        for index, (start, end, request_id) in enumerate(items):
            for other_start, other_end, other_id in items[index + 1 :]:
                if other_start >= end:
                    break
                if other_start < end and start < other_end:
                    routed.add(request_id)
                    routed.add(other_id)
    return routed


def stacked_driver_ids(
    intervals: list[BusyInterval],
    window_start: datetime,
    window_end: datetime,
) -> set[uuid.UUID]:
    events: list[tuple[datetime, int, uuid.UUID]] = []
    for interval in intervals:
        clipped = _clip(interval, window_start, window_end)
        if clipped is None:
            continue
        start, end = clipped
        events.append((start, 1, interval.driver_id))
        events.append((end, -1, interval.driver_id))
    events.sort(key=lambda item: (item[0], item[1]))
    open_counts: dict[uuid.UUID, int] = {}
    stacked: set[uuid.UUID] = set()
    for _, delta, driver_id in events:
        open_counts[driver_id] = open_counts.get(driver_id, 0) + delta
        if open_counts[driver_id] <= 0:
            open_counts.pop(driver_id, None)
        elif open_counts[driver_id] >= 2:
            stacked.add(driver_id)
    return stacked
