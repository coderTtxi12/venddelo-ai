from app.modules.delivery_dispatch.geo import geodesic_meters


def test_cdmx_nearby_points_are_within_twenty_kilometers():
    zocalo_lat, zocalo_lng = 19.4326, -99.1332
    bellas_artes_lat, bellas_artes_lng = 19.4352, -99.1412

    distance = geodesic_meters(zocalo_lat, zocalo_lng, bellas_artes_lat, bellas_artes_lng)

    assert distance > 0
    assert distance < 20_000
