from datetime import UTC, datetime, time
from uuid import uuid4

from app.modules.delivery_providers.availability import (
    is_within_regular_schedule,
    is_within_schedule,
    resolve_service_status,
)
from app.modules.delivery_providers.schemas import DeliveryProviderScheduleDTO


def _slot(day: int, opens: str, closes: str, kind: str = "regular") -> DeliveryProviderScheduleDTO:
    return DeliveryProviderScheduleDTO(
        id=uuid4(),
        schedule_kind=kind,  # type: ignore[arg-type]
        day_of_week=day,
        opens_at=time.fromisoformat(opens),
        closes_at=time.fromisoformat(closes),
    )


def test_is_within_schedule_during_regular_hours():
    schedules = [_slot(0, "09:00:00", "21:00:00")]
    now = datetime(2026, 6, 22, 15, 0, tzinfo=UTC)  # Monday in CDMX morning context

    assert is_within_schedule(
        schedules,
        timezone="America/Mexico_City",
        now=now,
    )


def test_resolve_service_status_manual_off_overrides_schedule():
    schedules = [_slot(0, "09:00:00", "21:00:00")]
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    resolved = resolve_service_status(
        manually_enabled=False,
        schedules=schedules,
        timezone="America/Mexico_City",
        now=now,
    )

    assert resolved.within_schedule is True
    assert resolved.service_active is False
    assert resolved.status_reason == "manual_off"


def test_is_within_schedule_early_morning_slot():
    schedules = [_slot(1, "01:00:00", "21:00:00")]
    # Tuesday 1:40 a.m. in Mexico City
    now = datetime(2026, 6, 23, 7, 40, tzinfo=UTC)

    assert is_within_schedule(
        schedules,
        timezone="America/Mexico_City",
        now=now,
    )


def test_resolve_service_status_active_with_early_morning_schedule():
    schedules = [_slot(1, "01:00:00", "21:00:00")]
    now = datetime(2026, 6, 23, 7, 40, tzinfo=UTC)

    resolved = resolve_service_status(
        manually_enabled=True,
        schedules=schedules,
        timezone="America/Mexico_City",
        now=now,
    )

    assert resolved.within_schedule is True
    assert resolved.service_active is True
    assert resolved.status_reason == "active"


def test_resolve_service_status_outside_schedule():
    schedules = [_slot(0, "09:00:00", "21:00:00")]
    now = datetime(2026, 6, 22, 5, 0, tzinfo=UTC)

    resolved = resolve_service_status(
        manually_enabled=True,
        schedules=schedules,
        timezone="America/Mexico_City",
        now=now,
    )

    assert resolved.within_schedule is False
    assert resolved.service_active is False
    assert resolved.status_reason == "outside_schedule"
    assert resolved.next_change_at is not None
