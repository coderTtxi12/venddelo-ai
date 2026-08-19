from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.exceptions import ValidationError

MEXICO_TZ = ZoneInfo("America/Mexico_City")
HISTORY_STATUSES = frozenset({"delivered", "cancelled"})
DEFAULT_LIMIT = 50
MAX_LIMIT = 100


def mexico_city_range(start: date, end: date) -> tuple[datetime, datetime]:
    if end < start:
        raise ValidationError("La fecha final no puede ser anterior a la inicial")
    start_local = datetime(start.year, start.month, start.day, tzinfo=MEXICO_TZ)
    end_local = datetime(end.year, end.month, end.day, tzinfo=MEXICO_TZ) + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def today_mexico() -> date:
    return datetime.now(MEXICO_TZ).date()
