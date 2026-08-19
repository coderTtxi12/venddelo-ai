from __future__ import annotations

from app.modules.delivery_dispatch.itinerary import (
    ItineraryJob,
    ItineraryStop,
    plan_itinerary,
)


def _job(
    request_id: str,
    *,
    status: str = "assigned",
    restaurant_lat: float = 19.43,
    restaurant_lng: float = -99.13,
    dropoff_lat: float = 19.44,
    dropoff_lng: float = -99.14,
) -> ItineraryJob:
    return ItineraryJob(
        request_id=request_id,
        status=status,
        restaurant_lat=restaurant_lat,
        restaurant_lng=restaurant_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
    )


def test_case_a_idle_is_pickup_then_dropoff():
    stops = plan_itinerary([_job("a")], case="A", rider_lat=19.43, rider_lng=-99.13)
    assert stops == [
        ItineraryStop(kind="restaurant", request_id="a"),
        ItineraryStop(kind="dropoff", request_id="a"),
    ]


def test_case_a_pre_free_finishes_current_dropoff_first():
    current = _job("old", status="in_transit", dropoff_lat=19.431, dropoff_lng=-99.131)
    nxt = _job("new", restaurant_lat=19.50, restaurant_lng=-99.20)
    stops = plan_itinerary(
        [current, nxt],
        case="A",
        rider_lat=19.43,
        rider_lng=-99.13,
        pre_free=True,
    )
    assert [stop.request_id for stop in stops] == ["old", "new", "new"]
    assert [stop.kind for stop in stops] == ["dropoff", "restaurant", "dropoff"]


def test_case_c_picks_nearest_restaurant_then_dropoffs():
    far = _job(
        "far",
        restaurant_lat=19.50,
        restaurant_lng=-99.20,
        dropoff_lat=19.51,
        dropoff_lng=-99.21,
    )
    near = _job(
        "near",
        restaurant_lat=19.431,
        restaurant_lng=-99.131,
        dropoff_lat=19.432,
        dropoff_lng=-99.132,
    )
    stops = plan_itinerary([far, near], case="C", rider_lat=19.43, rider_lng=-99.13)
    assert [stop.kind for stop in stops] == [
        "restaurant",
        "restaurant",
        "dropoff",
        "dropoff",
    ]
    assert [stop.request_id for stop in stops[:2]] == ["near", "far"]


def test_case_d_inserts_new_pickup_then_keeps_existing_then_new_dropoff():
    existing = [
        ItineraryStop(kind="dropoff", request_id="old"),
    ]
    old = _job("old", status="in_transit")
    nxt = _job("new")
    stops = plan_itinerary(
        [old, nxt],
        case="D",
        rider_lat=19.43,
        rider_lng=-99.13,
        previous=existing,
        new_request_ids={"new"},
    )
    assert stops == [
        ItineraryStop(kind="restaurant", request_id="new"),
        ItineraryStop(kind="dropoff", request_id="old"),
        ItineraryStop(kind="dropoff", request_id="new"),
    ]


def _pickup_before_dropoff(stops: list[ItineraryStop]) -> bool:
    pickup_at: dict[str, int] = {}
    dropoff_at: dict[str, int] = {}
    for index, stop in enumerate(stops):
        if stop.kind == "restaurant":
            pickup_at[stop.request_id] = index
        else:
            dropoff_at[stop.request_id] = index
    return all(
        pickup_at[request_id] < index
        for request_id, index in dropoff_at.items()
        if request_id in pickup_at
    )


def test_manual_can_interleave_without_reversing_a_pair():
    jobs = [_job("a"), _job("q")]
    manual = [
        ItineraryStop(kind="restaurant", request_id="a"),
        ItineraryStop(kind="restaurant", request_id="q"),
        ItineraryStop(kind="dropoff", request_id="a"),
        ItineraryStop(kind="dropoff", request_id="q"),
    ]
    stops = plan_itinerary(jobs, case="M", rider_lat=None, rider_lng=None, manual=manual)
    assert stops == manual


def test_manual_cannot_deliver_before_pickup():
    jobs = [_job("a"), _job("q")]
    invalid = [
        ItineraryStop(kind="dropoff", request_id="q"),
        ItineraryStop(kind="restaurant", request_id="q"),
        ItineraryStop(kind="dropoff", request_id="a"),
        ItineraryStop(kind="restaurant", request_id="a"),
    ]
    stops = plan_itinerary(jobs, case="M", rider_lat=None, rider_lng=None, manual=invalid)
    assert _pickup_before_dropoff(stops)
    assert stops != invalid


def test_auto_cases_never_deliver_before_pickup():
    old = _job("a", status="in_transit")
    nxt = _job("q")
    plans = [
        plan_itinerary([_job("a")], case="A", rider_lat=19.43, rider_lng=-99.13),
        plan_itinerary(
            [old, nxt],
            case="A",
            rider_lat=19.43,
            rider_lng=-99.13,
            pre_free=True,
        ),
        plan_itinerary([nxt, _job("b")], case="C", rider_lat=19.43, rider_lng=-99.13),
        plan_itinerary(
            [old, nxt],
            case="D",
            rider_lat=19.43,
            rider_lng=-99.13,
            previous=[ItineraryStop(kind="dropoff", request_id="a")],
            new_request_ids={"q"},
        ),
    ]
    assert all(_pickup_before_dropoff(stops) for stops in plans)


def test_manual_order_appends_pending_stops_the_drawer_omitted():
    jobs = [_job("old", status="in_transit"), _job("new")]
    manual = [
        ItineraryStop(kind="restaurant", request_id="new"),
        ItineraryStop(kind="dropoff", request_id="new"),
    ]
    stops = plan_itinerary(jobs, case="M", rider_lat=None, rider_lng=None, manual=manual)
    assert stops == [
        ItineraryStop(kind="restaurant", request_id="new"),
        ItineraryStop(kind="dropoff", request_id="new"),
        ItineraryStop(kind="dropoff", request_id="old"),
    ]


def test_picked_up_job_skips_restaurant_stop():
    stops = plan_itinerary(
        [_job("a", status="picked_up")],
        case="A",
        rider_lat=19.43,
        rider_lng=-99.13,
    )
    assert stops == [ItineraryStop(kind="dropoff", request_id="a")]
