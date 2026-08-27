from datetime import datetime, timedelta, timezone


def compute_search_at(now: datetime, ready_at: datetime, search_ahead_minutes: int) -> datetime:
    if search_ahead_minutes <= 0:
        return now
    candidate = ready_at - timedelta(minutes=search_ahead_minutes)
    return now if candidate <= now else candidate


def prep_minutes_from_times(created_at: datetime, ready_at: datetime) -> int:
    created = created_at if created_at.tzinfo is not None else created_at.replace(tzinfo=timezone.utc)
    ready = ready_at if ready_at.tzinfo is not None else ready_at.replace(tzinfo=timezone.utc)
    minutes = int(round((ready - created).total_seconds() / 60))
    return max(1, minutes)
