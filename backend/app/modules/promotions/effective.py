from __future__ import annotations

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from app.modules.promotions.schemas import PromotionDTO

DEFAULT_TIMEZONE = "America/Mexico_City"


def resolve_timezone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TIMEZONE)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def is_promotion_effective(
    promo: PromotionDTO,
    now_utc: datetime,
    tz: ZoneInfo,
) -> bool:
    if not promo.is_active:
        return False

    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=UTC)
    local = now_utc.astimezone(tz)

    if promo.starts_at is not None:
        starts = promo.starts_at
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=UTC)
        if local < starts.astimezone(tz):
            return False

    if promo.ends_at is not None:
        ends = promo.ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=UTC)
        if local >= ends.astimezone(tz):
            return False

    weekdays = promo.recurrence_weekdays or []
    if weekdays and local.weekday() not in weekdays:
        return False

    if promo.recurrence_start_time or promo.recurrence_end_time:
        start = promo.recurrence_start_time or time(0, 0)
        end = promo.recurrence_end_time or time(23, 59, 59)
        current = local.timetz().replace(tzinfo=None)
        if not (start <= current < end):
            return False

    return True


def effective_status(
    promo: PromotionDTO,
    now_utc: datetime,
    tz: ZoneInfo,
) -> str:
    if not promo.is_active:
        return "inactive"

    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=UTC)
    local = now_utc.astimezone(tz)

    if promo.starts_at is not None:
        starts = promo.starts_at
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=UTC)
        if local < starts.astimezone(tz):
            return "scheduled"

    if promo.ends_at is not None:
        ends = promo.ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=UTC)
        if local >= ends.astimezone(tz):
            return "expired"

    if is_promotion_effective(promo, now_utc, tz):
        return "active"
    return "outside_schedule"
