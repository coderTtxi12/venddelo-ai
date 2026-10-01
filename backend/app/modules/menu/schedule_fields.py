from __future__ import annotations

from datetime import time

from app.modules.menu.schemas import ProductMenuScheduleDTO, ProductMenuScheduleInput


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != 2:
        raise ValueError("time must be HH:MM")
    hour, minute = int(parts[0]), int(parts[1])
    return time(hour, minute)


def _time_to_hhmm(value: time | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%H:%M")


def menu_schedule_to_db_fields(
    schedule: ProductMenuScheduleInput | None,
) -> dict[str, object]:
    if schedule is None:
        return {
            "menu_schedule_weekdays": None,
            "menu_schedule_start_time": None,
            "menu_schedule_end_time": None,
        }

    weekdays = schedule.weekdays or None
    if not weekdays and not schedule.use_time_window:
        return {
            "menu_schedule_weekdays": None,
            "menu_schedule_start_time": None,
            "menu_schedule_end_time": None,
        }

    start_time = None
    end_time = None
    if schedule.use_time_window:
        start_time = _parse_hhmm(schedule.daily_start_time)
        end_time = _parse_hhmm(schedule.daily_end_time)

    return {
        "menu_schedule_weekdays": weekdays,
        "menu_schedule_start_time": start_time,
        "menu_schedule_end_time": end_time,
    }


def menu_schedule_from_product(
    weekdays: list[int] | None,
    start_time: time | None,
    end_time: time | None,
) -> ProductMenuScheduleDTO | None:
    days = weekdays or []
    use_time_window = start_time is not None or end_time is not None
    if not days and not use_time_window:
        return None
    return ProductMenuScheduleDTO(
        weekdays=days,
        use_time_window=use_time_window,
        daily_start_time=_time_to_hhmm(start_time),
        daily_end_time=_time_to_hhmm(end_time),
    )
