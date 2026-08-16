from app.modules.delivery_providers.matching import pick_nearest_zone


def test_pick_nearest_zone_prefers_smaller_distance():
    a = {"id": "a", "distance_km": 2.0, "priority": 0, "created_at": 1}
    b = {"id": "b", "distance_km": 1.0, "priority": 0, "created_at": 0}
    assert pick_nearest_zone([a, b])["id"] == "b"


def test_pick_nearest_zone_tie_uses_priority_then_created():
    a = {"id": "a", "distance_km": 1.0, "priority": 1, "created_at": 0}
    b = {"id": "b", "distance_km": 1.0, "priority": 0, "created_at": 9}
    assert pick_nearest_zone([a, b])["id"] == "b"
