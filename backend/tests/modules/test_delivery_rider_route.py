from app.modules.delivery_dispatch.rider_route import (
    group_offer_totals,
    order_offer_stops,
)


def test_group_offer_totals_sums_packages_and_cash_collect():
    totals = group_offer_totals(
        [
            {"package_count": 1, "payment_method": "cash", "collect_cents": 10000},
            {"package_count": 2, "payment_method": "transfer", "collect_cents": 0},
        ]
    )
    assert totals["package_count"] == 3
    assert totals["collect_cents"] == 10000
    assert totals["payment_method"] == "mixed"


def test_group_offer_totals_keeps_single_payment_method():
    totals = group_offer_totals(
        [
            {"package_count": 1, "payment_method": "transfer", "collect_cents": 0},
            {"package_count": 1, "payment_method": "transfer", "collect_cents": 0},
        ]
    )
    assert totals["package_count"] == 2
    assert totals["collect_cents"] == 0
    assert totals["payment_method"] == "transfer"


def test_order_offer_stops_visits_nearest_restaurant_first():
    rider = (19.40, -99.16)
    far_restaurant = {
        "restaurant_name": "Far",
        "restaurant_lat": 19.50,
        "restaurant_lng": -99.20,
        "dropoff_lat": 19.51,
        "dropoff_lng": -99.21,
        "dropoff_address": "Far dropoff",
    }
    near_restaurant = {
        "restaurant_name": "Near",
        "restaurant_lat": 19.401,
        "restaurant_lng": -99.161,
        "dropoff_lat": 19.41,
        "dropoff_lng": -99.17,
        "dropoff_address": "Near dropoff",
    }
    ordered = order_offer_stops([far_restaurant, near_restaurant], rider[0], rider[1])
    assert [stop["restaurant_name"] for stop in ordered] == ["Near", "Far"]
