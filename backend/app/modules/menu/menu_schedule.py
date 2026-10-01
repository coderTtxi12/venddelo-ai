from __future__ import annotations

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from app.modules.menu.schemas import ProductDTO


def has_menu_schedule(product: ProductDTO) -> bool:
    schedule = product.menu_schedule
    if schedule is None:
        return False
    if schedule.weekdays:
        return True
    return schedule.use_time_window


def is_product_menu_schedule_active(
    product: ProductDTO,
    now_utc: datetime,
    tz: ZoneInfo,
) -> bool:
    schedule = product.menu_schedule
    if schedule is None:
        return True

    weekdays = schedule.weekdays
    use_time_window = schedule.use_time_window

    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=UTC)
    local = now_utc.astimezone(tz)

    if weekdays and local.weekday() not in weekdays:
        return False

    if use_time_window:
        start = _parse_hhmm(schedule.daily_start_time) or time(0, 0)
        end = _parse_hhmm(schedule.daily_end_time) or time(23, 59, 59)
        current = local.timetz().replace(tzinfo=None)
        if not (start <= current < end):
            return False

    return True


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != 2:
        return None
    hour, minute = int(parts[0]), int(parts[1])
    return time(hour, minute)
