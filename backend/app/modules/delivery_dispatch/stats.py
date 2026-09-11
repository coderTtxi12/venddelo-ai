from __future__ import annotations

import calendar
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from sqlalchemy import Date, Integer, case, cast, extract, func, select
from sqlalchemy.orm import Session

from app.db.models.delivery import DeliveryDispatchOffer, DeliveryDispatchRequest, DeliveryDriver
from app.db.models.restaurant import Restaurant
from app.modules.delivery_dispatch.history import (
    HISTORY_STATUSES,
    MEXICO_TZ,
    _normalize_ids,
    closed_at_expr,
    list_dispatch_history,
    mexico_city_range,
    today_mexico,
)
from app.modules.delivery_dispatch.occupancy import (
    BusyInterval,
    normalize_customer_phone,
    peak_occupancy,
    require_same_length,
    routed_request_ids,
    stacked_driver_ids,
)

StatsGranularity = Literal["hourly", "daily", "weekly"]

_MONTH_ES = (
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
)
_TOP_LIMIT = 8
_RECENT_LIMIT = 12


def comparison_date_range(start: date, end: date) -> tuple[date, date]:
    last_day = calendar.monthrange(start.year, start.month)[1]
    if start.day == 1 and end == date(start.year, start.month, last_day):
        prev_end = start - timedelta(days=1)
        return date(prev_end.year, prev_end.month, 1), prev_end
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)
    return prev_start, prev_end


def stats_granularity(start: date, end: date) -> StatsGranularity:
    days = (end - start).days + 1
    if days <= 1:
        return "hourly"
    if days <= 31:
        return "daily"
    return "weekly"


def stats_pct_change(current: int | float, previous: int | float) -> float | None:
    if previous == 0:
        if current == 0:
            return 0.0
        return 100.0
    return round(((current - previous) / previous) * 100, 1)


def _exclusion_filters(
    exclude_restaurant_id: uuid.UUID | list[uuid.UUID] | None,
    exclude_driver_id: uuid.UUID | list[uuid.UUID] | None,
    exclude_customer_phone: list[str] | None,
) -> list:
    filters: list = []
    restaurants = _normalize_ids(exclude_restaurant_id)
    drivers = _normalize_ids(exclude_driver_id)
    phones = [
        normalize_customer_phone(phone)
        for phone in (exclude_customer_phone or [])
        if normalize_customer_phone(phone)
    ]
    if restaurants:
        filters.append(DeliveryDispatchRequest.restaurant_id.notin_(restaurants))
    if drivers:
        filters.append(
            DeliveryDispatchRequest.assigned_driver_id.is_(None)
            | DeliveryDispatchRequest.assigned_driver_id.notin_(drivers)
        )
    if phones:
        digits = func.regexp_replace(DeliveryDispatchRequest.customer_phone, "[^0-9]", "", "g")
        filters.append(digits.notin_(phones))
    return filters


def _closed_filters(
    provider_id: uuid.UUID,
    zone_id: uuid.UUID | None,
    start: date,
    end: date,
    *,
    exclude_restaurant_id: uuid.UUID | list[uuid.UUID] | None = None,
    exclude_driver_id: uuid.UUID | list[uuid.UUID] | None = None,
    exclude_customer_phone: list[str] | None = None,
):
    start_utc, end_utc = mexico_city_range(start, end)
    closed = closed_at_expr()
    filters = [
        DeliveryDispatchRequest.status.in_(tuple(HISTORY_STATUSES)),
        closed >= start_utc,
        closed < end_utc,
        DeliveryDispatchRequest.delivery_provider_id == provider_id,
        *_exclusion_filters(exclude_restaurant_id, exclude_driver_id, exclude_customer_phone),
    ]
    if zone_id is not None:
        filters.append(DeliveryDispatchRequest.zone_id == zone_id)
    return filters


def _created_filters(
    provider_id: uuid.UUID,
    zone_id: uuid.UUID | None,
    start: date,
    end: date,
    *,
    exclude_restaurant_id: uuid.UUID | list[uuid.UUID] | None = None,
    exclude_driver_id: uuid.UUID | list[uuid.UUID] | None = None,
    exclude_customer_phone: list[str] | None = None,
):
    start_utc, end_utc = mexico_city_range(start, end)
    filters = [
        DeliveryDispatchRequest.created_at >= start_utc,
        DeliveryDispatchRequest.created_at < end_utc,
        DeliveryDispatchRequest.delivery_provider_id == provider_id,
        *_exclusion_filters(exclude_restaurant_id, exclude_driver_id, exclude_customer_phone),
    ]
    if zone_id is not None:
        filters.append(DeliveryDispatchRequest.zone_id == zone_id)
    return filters


def _empty_counts() -> dict[str, int]:
    return {
        "order_count": 0,
        "delivered_count": 0,
        "cancelled_count": 0,
        "earnings_cents": 0,
        "mexy_fee_cents": 0,
        "web_app_count": 0,
        "manual_count": 0,
    }


def _period_counts(session: Session, filters: list) -> dict[str, int]:
    delivered = DeliveryDispatchRequest.status == "delivered"
    web = DeliveryDispatchRequest.order_id.is_not(None)
    row = session.execute(
        select(
            func.count(),
            func.coalesce(func.sum(case((delivered, 1), else_=0)), 0),
            func.coalesce(func.sum(case((delivered, 0), else_=1)), 0),
            func.coalesce(
                func.sum(case((delivered, DeliveryDispatchRequest.quoted_fee_cents), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(case((delivered, DeliveryDispatchRequest.mexy_fee_cents), else_=0)),
                0,
            ),
            func.coalesce(func.sum(case((web, 1), else_=0)), 0),
        ).where(*filters)
    ).one()
    order_count = int(row[0] or 0)
    delivered_count = int(row[1] or 0)
    cancelled_count = int(row[2] or 0)
    if order_count == 0:
        return _empty_counts()
    return {
        "order_count": order_count,
        "delivered_count": delivered_count,
        "cancelled_count": cancelled_count,
        "earnings_cents": int(row[3] or 0),
        "mexy_fee_cents": int(row[4] or 0),
        "web_app_count": int(row[5] or 0),
        "manual_count": order_count - int(row[5] or 0),
    }


def _local_closed():
    return func.timezone("America/Mexico_City", closed_at_expr())


def _local_created():
    return func.timezone("America/Mexico_City", DeliveryDispatchRequest.created_at)


def _series_bucket(granularity: StatsGranularity):
    local = _local_closed()
    if granularity == "hourly":
        return extract("hour", local)
    if granularity == "daily":
        return cast(local, Date)
    return func.date_trunc("week", local)


def _period_series(
    session: Session,
    filters: list,
    granularity: StatsGranularity,
) -> dict:
    delivered = DeliveryDispatchRequest.status == "delivered"
    bucket = _series_bucket(granularity)
    rows = session.execute(
        select(
            bucket,
            func.count(),
            func.coalesce(
                func.sum(case((delivered, DeliveryDispatchRequest.quoted_fee_cents), else_=0)),
                0,
            ),
            func.coalesce(func.sum(case((delivered, 1), else_=0)), 0),
            func.coalesce(func.sum(case((delivered, 0), else_=1)), 0),
        )
        .where(*filters)
        .group_by(bucket)
        .order_by(bucket)
    ).all()
    keyed: dict = {}
    for key, count, earnings, delivered_count, cancelled_count in rows:
        if key is None:
            continue
        payload = {
            "count": int(count),
            "earnings": int(earnings),
            "delivered": int(delivered_count),
            "cancelled": int(cancelled_count),
        }
        if granularity == "hourly":
            keyed[int(key)] = payload
        elif granularity == "daily":
            keyed[key] = payload
        else:
            keyed[key.date() if hasattr(key, "date") else key] = payload
    return keyed


def _format_day(value: date) -> str:
    return f"{value.day} {_MONTH_ES[value.month - 1]}"


def _bucket_labels(start: date, end: date, granularity: StatsGranularity) -> list[tuple]:
    if granularity == "hourly":
        return [(hour, f"{hour:02d}:00") for hour in range(24)]
    if granularity == "daily":
        labels: list[tuple] = []
        cursor = start
        while cursor <= end:
            labels.append((cursor, _format_day(cursor)))
            cursor += timedelta(days=1)
        return labels
    labels = []
    monday = start - timedelta(days=start.weekday())
    while monday <= end:
        week_end = min(monday + timedelta(days=6), end)
        label = _format_day(monday) if monday == week_end else f"{_format_day(monday)}–{_format_day(week_end)}"
        labels.append((monday, label))
        monday += timedelta(days=7)
    return labels


def _empty_bucket() -> dict[str, int]:
    return {
        "count": 0,
        "earnings": 0,
        "delivered": 0,
        "cancelled": 0,
        "occupancy": 0,
        "routed": 0,
    }


def _aligned_series(
    current: dict,
    previous: dict,
    occupancy_current: dict,
    occupancy_previous: dict,
    durations_current: dict,
    start: date,
    end: date,
    prev_start: date,
    prev_end: date,
    granularity: StatsGranularity,
) -> list[dict]:
    current_keys = _bucket_labels(start, end, granularity)
    previous_keys = _bucket_labels(prev_start, prev_end, granularity)
    series: list[dict] = []
    for index, (key, label) in enumerate(current_keys):
        cur = {**_empty_bucket(), **current.get(key, {}), **occupancy_current.get(key, {})}
        prev_key = previous_keys[index][0] if index < len(previous_keys) else None
        prev = (
            {**_empty_bucket(), **previous.get(prev_key, {}), **occupancy_previous.get(prev_key, {})}
            if prev_key is not None
            else _empty_bucket()
        )
        durations = {**_empty_durations(), **durations_current.get(key, {})}
        series.append(
            {
                "label": label,
                "current_count": cur["count"],
                "previous_count": prev["count"],
                "current_earnings_cents": cur["earnings"],
                "previous_earnings_cents": prev["earnings"],
                "current_delivered_count": cur["delivered"],
                "current_cancelled_count": cur["cancelled"],
                "previous_delivered_count": prev["delivered"],
                "previous_cancelled_count": prev["cancelled"],
                "current_occupancy": cur["occupancy"],
                "previous_occupancy": prev["occupancy"],
                "current_routed": cur["routed"],
                "previous_routed": prev["routed"],
                **{k: durations.get(k) for k in _DURATION_KEYS},
            }
        )
    return series


def _top_restaurants(session: Session, filters: list) -> list[dict]:
    delivered = DeliveryDispatchRequest.status == "delivered"
    delivered_count = func.coalesce(func.sum(case((delivered, 1), else_=0)), 0)
    earnings = func.coalesce(
        func.sum(case((delivered, DeliveryDispatchRequest.quoted_fee_cents), else_=0)),
        0,
    )
    rows = session.execute(
        select(
            Restaurant.id,
            Restaurant.name,
            delivered_count.label("delivered_count"),
            earnings.label("earnings_cents"),
        )
        .join(Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id)
        .where(*filters)
        .group_by(Restaurant.id, Restaurant.name)
        .having(delivered_count > 0)
        .order_by(delivered_count.desc(), earnings.desc())
        .limit(_TOP_LIMIT)
    ).all()
    return [
        {
            "id": restaurant_id,
            "name": name,
            "delivered_count": int(count),
            "earnings_cents": int(cents),
        }
        for restaurant_id, name, count, cents in rows
    ]


def _top_drivers(session: Session, filters: list) -> list[dict]:
    delivered = DeliveryDispatchRequest.status == "delivered"
    delivered_count = func.coalesce(func.sum(case((delivered, 1), else_=0)), 0)
    earnings = func.coalesce(
        func.sum(case((delivered, DeliveryDispatchRequest.quoted_fee_cents), else_=0)),
        0,
    )
    rows = session.execute(
        select(
            DeliveryDriver.id,
            DeliveryDriver.first_name,
            DeliveryDriver.last_name,
            delivered_count.label("delivered_count"),
            earnings.label("earnings_cents"),
        )
        .join(
            DeliveryDriver,
            DeliveryDriver.id == DeliveryDispatchRequest.assigned_driver_id,
        )
        .where(*filters, DeliveryDispatchRequest.assigned_driver_id.is_not(None))
        .group_by(DeliveryDriver.id, DeliveryDriver.first_name, DeliveryDriver.last_name)
        .having(delivered_count > 0)
        .order_by(delivered_count.desc(), earnings.desc())
        .limit(_TOP_LIMIT)
    ).all()
    return [
        {
            "id": driver_id,
            "name": f"{first} {last}".strip() or "Repartidor",
            "delivered_count": int(count),
            "earnings_cents": int(cents),
        }
        for driver_id, first, last, count, cents in rows
    ]


def _sources(counts: dict[str, int]) -> list[dict]:
    return [
        {
            "source": "web_app",
            "count": counts["web_app_count"],
        },
        {
            "source": "manual",
            "count": counts["manual_count"],
        },
    ]


def _hour_heatmap(session: Session, filters: list) -> list[dict]:
    local = _local_created()
    hour = cast(extract("hour", local), Integer)
    weekday = cast(func.mod(extract("dow", local) + 6, 7), Integer)
    rows = session.execute(
        select(weekday, hour, func.count()).where(*filters).group_by(weekday, hour)
    ).all()
    counts = {(int(day), int(hr)): int(count) for day, hr, count in rows if day is not None and hr is not None}
    cells: list[dict] = []
    for day in range(7):
        for hr in range(24):
            cells.append({"weekday": day, "hour": hr, "count": counts.get((day, hr), 0)})
    return cells


def _peak_hour(heatmap: list[dict]) -> tuple[str | None, int]:
    if not heatmap:
        return None, 0
    best = max(heatmap, key=lambda row: row["count"])
    if best["count"] <= 0:
        return None, 0
    return f"{int(best['hour']):02d}:00", int(best["count"])


def _busy_start_expr():
    accepted_at = (
        select(func.min(DeliveryDispatchOffer.responded_at))
        .where(
            DeliveryDispatchOffer.request_id == DeliveryDispatchRequest.id,
            DeliveryDispatchOffer.status == "accepted",
        )
        .correlate(DeliveryDispatchRequest)
        .scalar_subquery()
    )
    return func.coalesce(
        accepted_at,
        DeliveryDispatchRequest.picked_up_at,
        DeliveryDispatchRequest.in_transit_at,
        DeliveryDispatchRequest.created_at,
    )


_DURATION_KEYS = (
    "avg_total_seconds",
    "avg_search_seconds",
    "avg_delivery_seconds",
    "avg_pickup_seconds",
    "avg_dropoff_seconds",
)


def _round_avg_seconds(value: object) -> int | None:
    if value is None:
        return None
    return int(round(float(value)))


def _empty_durations() -> dict[str, int | None]:
    return {key: None for key in _DURATION_KEYS}


def _duration_change_pcts(
    current: dict[str, int | None],
    previous: dict[str, int | None],
) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for key in _DURATION_KEYS:
        cur = current.get(key)
        prev = previous.get(key)
        if cur is None or prev is None:
            out[f"{key}_change_pct"] = None
        else:
            out[f"{key}_change_pct"] = stats_pct_change(cur, prev)
    return out


def _accepted_at_expr():
    return (
        select(func.min(DeliveryDispatchOffer.responded_at))
        .where(
            DeliveryDispatchOffer.request_id == DeliveryDispatchRequest.id,
            DeliveryDispatchOffer.status == "accepted",
        )
        .correlate(DeliveryDispatchRequest)
        .scalar_subquery()
    )


def _avg_positive_epoch(start, end):
    delivered = DeliveryDispatchRequest.status == "delivered"
    return func.avg(
        case(
            (
                delivered & start.is_not(None) & end.is_not(None) & (end > start),
                extract("epoch", end - start),
            ),
            else_=None,
        )
    )


def _duration_select_columns():
    accepted = _accepted_at_expr()
    created = DeliveryDispatchRequest.created_at
    delivered_at = DeliveryDispatchRequest.delivered_at
    search_at = DeliveryDispatchRequest.search_at
    picked_up_at = DeliveryDispatchRequest.picked_up_at
    in_transit_at = DeliveryDispatchRequest.in_transit_at
    return (
        _avg_positive_epoch(created, delivered_at),
        _avg_positive_epoch(search_at, accepted),
        _avg_positive_epoch(search_at, delivered_at),
        _avg_positive_epoch(accepted, picked_up_at),
        _avg_positive_epoch(in_transit_at, delivered_at),
    )


def _row_to_durations(row) -> dict[str, int | None]:
    return {
        key: _round_avg_seconds(value)
        for key, value in zip(_DURATION_KEYS, row, strict=True)
    }


def _period_durations(session: Session, filters: list) -> dict[str, int | None]:
    row = session.execute(select(*_duration_select_columns()).where(*filters)).one()
    return _row_to_durations(row)


def _duration_series(
    session: Session,
    filters: list,
    granularity: StatsGranularity,
) -> dict:
    bucket = _series_bucket(granularity)
    rows = session.execute(
        select(bucket, *_duration_select_columns())
        .where(*filters)
        .group_by(bucket)
        .order_by(bucket)
    ).all()
    keyed: dict = {}
    for key, *values in rows:
        if key is None:
            continue
        payload = _row_to_durations(values)
        if granularity == "hourly":
            keyed[int(key)] = payload
        elif granularity == "daily":
            keyed[key] = payload
        else:
            keyed[key.date() if hasattr(key, "date") else key] = payload
    return keyed


def _busy_end_expr():
    return func.coalesce(
        DeliveryDispatchRequest.delivered_at,
        DeliveryDispatchRequest.cancelled_at,
        DeliveryDispatchRequest.updated_at,
    )


def _load_busy_intervals(
    session: Session,
    *,
    provider_id: uuid.UUID,
    zone_id: uuid.UUID | None,
    start: date,
    end: date,
    exclude_restaurant_id: uuid.UUID | list[uuid.UUID] | None,
    exclude_driver_id: uuid.UUID | list[uuid.UUID] | None,
    exclude_customer_phone: list[str] | None,
) -> list[BusyInterval]:
    start_utc, end_utc = mexico_city_range(start, end)
    busy_start = _busy_start_expr()
    busy_end = _busy_end_expr()
    filters = [
        DeliveryDispatchRequest.delivery_provider_id == provider_id,
        DeliveryDispatchRequest.assigned_driver_id.is_not(None),
        busy_start < end_utc,
        busy_end > start_utc,
        *_exclusion_filters(exclude_restaurant_id, exclude_driver_id, exclude_customer_phone),
    ]
    if zone_id is not None:
        filters.append(DeliveryDispatchRequest.zone_id == zone_id)
    rows = session.execute(
        select(
            DeliveryDispatchRequest.assigned_driver_id,
            DeliveryDispatchRequest.id,
            busy_start,
            busy_end,
            DeliveryDispatchRequest.dispatch_group_id,
        ).where(*filters)
    ).all()
    intervals: list[BusyInterval] = []
    for driver_id, request_id, starts, ends, group_id in rows:
        if driver_id is None or starts is None or ends is None:
            continue
        intervals.append(
            BusyInterval(
                driver_id=driver_id,
                request_id=request_id,
                start=starts,
                end=ends,
                grouped=group_id is not None,
            )
        )
    return intervals


def _bucket_windows(
    start: date,
    end: date,
    granularity: StatsGranularity,
) -> list[tuple]:
    windows: list[tuple] = []
    if granularity == "hourly":
        for hour in range(24):
            local = datetime(start.year, start.month, start.day, hour, tzinfo=MEXICO_TZ)
            windows.append((hour, local.astimezone(UTC), (local + timedelta(hours=1)).astimezone(UTC)))
        return windows
    if granularity == "daily":
        cursor = start
        while cursor <= end:
            start_utc, end_utc = mexico_city_range(cursor, cursor)
            windows.append((cursor, start_utc, end_utc))
            cursor += timedelta(days=1)
        return windows
    monday = start - timedelta(days=start.weekday())
    while monday <= end:
        week_end = min(monday + timedelta(days=6), end)
        start_utc, end_utc = mexico_city_range(monday, week_end)
        windows.append((monday, start_utc, end_utc))
        monday += timedelta(days=7)
    return windows


def _occupancy_buckets(
    intervals: list[BusyInterval],
    start: date,
    end: date,
    granularity: StatsGranularity,
) -> dict:
    keyed: dict = {}
    for key, window_start, window_end in _bucket_windows(start, end, granularity):
        keyed[key] = {
            "occupancy": peak_occupancy(intervals, window_start, window_end),
            "routed": len(routed_request_ids(intervals, window_start, window_end)),
        }
    return keyed


def _build_summary(
    current: dict[str, int],
    previous: dict[str, int],
    *,
    peak_hour: str | None,
    peak_hour_count: int,
    peak_occupancy: int,
    previous_occupancy: int,
    routed_order_count: int,
    previous_routed: int,
    stacked_rider_count: int,
    current_durations: dict[str, int | None],
    previous_durations: dict[str, int | None],
) -> dict:
    total = current["order_count"]
    cancellation_rate = round((current["cancelled_count"] / total) * 100, 1) if total else 0.0
    return {
        **current,
        "cancellation_rate_pct": cancellation_rate,
        "peak_hour": peak_hour,
        "peak_hour_count": peak_hour_count,
        "peak_occupancy": peak_occupancy,
        "peak_occupancy_change_pct": stats_pct_change(peak_occupancy, previous_occupancy),
        "routed_order_count": routed_order_count,
        "routed_order_change_pct": stats_pct_change(routed_order_count, previous_routed),
        "stacked_rider_count": stacked_rider_count,
        "order_count_change_pct": stats_pct_change(current["order_count"], previous["order_count"]),
        "delivered_count_change_pct": stats_pct_change(
            current["delivered_count"], previous["delivered_count"]
        ),
        "cancelled_count_change_pct": stats_pct_change(
            current["cancelled_count"], previous["cancelled_count"]
        ),
        "earnings_change_pct": stats_pct_change(current["earnings_cents"], previous["earnings_cents"]),
        "web_app_count_change_pct": stats_pct_change(
            current["web_app_count"], previous["web_app_count"]
        ),
        "manual_count_change_pct": stats_pct_change(current["manual_count"], previous["manual_count"]),
        **current_durations,
        **_duration_change_pcts(current_durations, previous_durations),
    }


def list_dispatch_stats(
    session: Session,
    *,
    provider_id: uuid.UUID,
    zone_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    compare_start: date | None = None,
    compare_end: date | None = None,
    exclude_restaurant_id: uuid.UUID | list[uuid.UUID] | None = None,
    exclude_driver_id: uuid.UUID | list[uuid.UUID] | None = None,
    exclude_customer_phone: list[str] | None = None,
) -> dict:
    start_d = start or today_mexico()
    end_d = end or start_d
    if compare_start is not None and compare_end is not None:
        prev_start, prev_end = require_same_length(start_d, end_d, compare_start, compare_end)
    else:
        prev_start, prev_end = comparison_date_range(start_d, end_d)
    granularity = stats_granularity(start_d, end_d)
    exclude_kw = dict(
        exclude_restaurant_id=exclude_restaurant_id,
        exclude_driver_id=exclude_driver_id,
        exclude_customer_phone=exclude_customer_phone,
    )
    current_filters = _closed_filters(provider_id, zone_id, start_d, end_d, **exclude_kw)
    previous_filters = _closed_filters(provider_id, zone_id, prev_start, prev_end, **exclude_kw)
    current = _period_counts(session, current_filters)
    previous = _period_counts(session, previous_filters)
    current_durations = _period_durations(session, current_filters)
    previous_durations = _period_durations(session, previous_filters)
    heatmap = _hour_heatmap(
        session, _created_filters(provider_id, zone_id, start_d, end_d, **exclude_kw)
    )
    peak_hour, peak_hour_count = _peak_hour(heatmap)
    current_busy = _load_busy_intervals(
        session, provider_id=provider_id, zone_id=zone_id, start=start_d, end=end_d, **exclude_kw
    )
    previous_busy = _load_busy_intervals(
        session, provider_id=provider_id, zone_id=zone_id, start=prev_start, end=prev_end, **exclude_kw
    )
    cur_start_utc, cur_end_utc = mexico_city_range(start_d, end_d)
    prev_start_utc, prev_end_utc = mexico_city_range(prev_start, prev_end)
    occupancy_now = peak_occupancy(current_busy, cur_start_utc, cur_end_utc)
    occupancy_prev = peak_occupancy(previous_busy, prev_start_utc, prev_end_utc)
    routed_now = routed_request_ids(current_busy, cur_start_utc, cur_end_utc)
    routed_prev = routed_request_ids(previous_busy, prev_start_utc, prev_end_utc)
    stacked_now = stacked_driver_ids(current_busy, cur_start_utc, cur_end_utc)
    recent = list_dispatch_history(
        session,
        provider_id=provider_id,
        zone_id=zone_id,
        start=start_d,
        end=end_d,
        exclude_driver_id=exclude_driver_id,
        exclude_restaurant_id=exclude_restaurant_id,
        limit=_RECENT_LIMIT,
        include_provider_fields=True,
    )
    phones = {
        normalize_customer_phone(phone)
        for phone in (exclude_customer_phone or [])
        if normalize_customer_phone(phone)
    }
    recent_items = recent["items"]
    if phones:
        recent_items = [
            item
            for item in recent_items
            if normalize_customer_phone(getattr(item, "customer_phone", "") or "") not in phones
        ]
    return {
        "start": start_d,
        "end": end_d,
        "comparison_start": prev_start,
        "comparison_end": prev_end,
        "granularity": granularity,
        "summary": _build_summary(
            current,
            previous,
            peak_hour=peak_hour,
            peak_hour_count=peak_hour_count,
            peak_occupancy=occupancy_now,
            previous_occupancy=occupancy_prev,
            routed_order_count=len(routed_now),
            previous_routed=len(routed_prev),
            stacked_rider_count=len(stacked_now),
            current_durations=current_durations,
            previous_durations=previous_durations,
        ),
        "series": _aligned_series(
            _period_series(session, current_filters, granularity),
            _period_series(session, previous_filters, granularity),
            _occupancy_buckets(current_busy, start_d, end_d, granularity),
            _occupancy_buckets(previous_busy, prev_start, prev_end, granularity),
            _duration_series(session, current_filters, granularity),
            start_d,
            end_d,
            prev_start,
            prev_end,
            granularity,
        ),
        "hour_heatmap": heatmap,
        "sources": _sources(current),
        "top_restaurants": _top_restaurants(session, current_filters),
        "top_drivers": _top_drivers(session, current_filters),
        "recent": recent_items,
    }
