from datetime import datetime, timedelta


def compute_search_at(now: datetime, ready_at: datetime, search_ahead_minutes: int) -> datetime:
    if search_ahead_minutes <= 0:
        return now
    candidate = ready_at - timedelta(minutes=search_ahead_minutes)
    return now if candidate <= now else candidate
