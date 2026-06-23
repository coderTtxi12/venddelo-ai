from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from app.modules.delivery_providers.schemas import DeliveryProviderScheduleDTO

ServiceStatusReason = Literal["active", "manual_off", "outside_schedule"]


@dataclass(frozen=True)
class ResolvedServiceStatus:
    manually_enabled: bool
    within_schedule: bool
    service_active: bool
    status_reason: ServiceStatusReason
    next_change_at: datetime | None
    timezone: str


def _combine_local(day: datetime, clock: time) -> datetime:
    return day.replace(
        hour=clock.hour,
        minute=clock.minute,
        second=clock.second,
        microsecond=0,
    )


def _is_time_in_slot(current: time, opens_at: time, closes_at: time) -> bool:
    return opens_at <= current < closes_at


def _schedules_for_kinds(
    schedules: list[DeliveryProviderScheduleDTO],
    schedule_kinds: frozenset[str] | None,
) -> list[DeliveryProviderScheduleDTO]:
    if schedule_kinds is None:
        return schedules
    return [slot for slot in schedules if slot.schedule_kind in schedule_kinds]


def is_within_schedule(
    schedules: list[DeliveryProviderScheduleDTO],
    *,
    timezone: str,
    now: datetime | None = None,
    schedule_kinds: frozenset[str] | None = None,
) -> bool:
    local_now = (now or datetime.now(UTC)).astimezone(ZoneInfo(timezone))
    day_index = local_now.weekday()
    current_time = local_now.time().replace(microsecond=0)

    for slot in _schedules_for_kinds(schedules, schedule_kinds):
        if slot.day_of_week != day_index:
            continue
        if _is_time_in_slot(current_time, slot.opens_at, slot.closes_at):
            return True
    return False


def is_within_regular_schedule(
    schedules: list[DeliveryProviderScheduleDTO],
    *,
    timezone: str,
    now: datetime | None = None,
) -> bool:
    return is_within_schedule(
        schedules,
        timezone=timezone,
        now=now,
        schedule_kinds=frozenset({"regular"}),
    )


def _slots_for_day(
    schedules: list[DeliveryProviderScheduleDTO],
    day_index: int,
) -> list[DeliveryProviderScheduleDTO]:
    return sorted(
        [slot for slot in schedules if slot.day_of_week == day_index],
        key=lambda slot: slot.opens_at,
    )


def _next_schedule_boundary(
    schedules: list[DeliveryProviderScheduleDTO],
    *,
    timezone: str,
    now: datetime | None = None,
) -> datetime | None:
    if not schedules:
        return None

    local_now = (now or datetime.now(UTC)).astimezone(ZoneInfo(timezone))
    tz = ZoneInfo(timezone)
    current_time = local_now.time().replace(microsecond=0)
    day_index = local_now.weekday()

    candidates: list[datetime] = []

    for offset in range(8):
        probe_day = local_now.date() + timedelta(days=offset)
        probe_index = (day_index + offset) % 7
        day_start = datetime.combine(probe_day, time.min, tzinfo=tz)

        for slot in _slots_for_day(schedules, probe_index):
            opens_at = _combine_local(day_start, slot.opens_at)
            closes_at = _combine_local(day_start, slot.closes_at)

            if offset == 0:
                if _is_time_in_slot(current_time, slot.opens_at, slot.closes_at):
                    if closes_at > local_now:
                        candidates.append(closes_at)
                    continue
                if slot.opens_at > current_time and opens_at > local_now:
                    candidates.append(opens_at)
            else:
                candidates.append(opens_at)

    future = [candidate for candidate in candidates if candidate > local_now]
    if not future:
        return None
    return min(future).astimezone(UTC)


def is_night_schedule(
    schedules: list[DeliveryProviderScheduleDTO],
    *,
    timezone: str,
    now: datetime | None = None,
) -> bool:
    local_now = (now or datetime.now(UTC)).astimezone(ZoneInfo(timezone))
    day_index = local_now.weekday()
    current_time = local_now.time().replace(microsecond=0)

    for slot in schedules:
        if slot.day_of_week != day_index:
            continue
        if slot.schedule_kind != "night":
            continue
        if _is_time_in_slot(current_time, slot.opens_at, slot.closes_at):
            return True
    return False


def resolve_service_status(
    *,
    manually_enabled: bool,
    schedules: list[DeliveryProviderScheduleDTO],
    timezone: str,
    now: datetime | None = None,
) -> ResolvedServiceStatus:
    within_schedule = is_within_schedule(schedules, timezone=timezone, now=now)
    service_active = manually_enabled and within_schedule

    if service_active:
        reason: ServiceStatusReason = "active"
    elif not manually_enabled:
        reason = "manual_off"
    else:
        reason = "outside_schedule"

    return ResolvedServiceStatus(
        manually_enabled=manually_enabled,
        within_schedule=within_schedule,
        service_active=service_active,
        status_reason=reason,
        next_change_at=_next_schedule_boundary(schedules, timezone=timezone, now=now),
        timezone=timezone,
    )
