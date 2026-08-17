from app.modules.delivery_dispatch.maps_url import parse_maps_url


def test_parses_at_lat_lng():
    assert parse_maps_url("https://www.google.com/maps/@19.43,-99.13,17z") == (
        19.43,
        -99.13,
    )


def test_parses_ll_query():
    assert parse_maps_url("https://maps.google.com/?ll=19.4326,-99.1332") == (
        19.4326,
        -99.1332,
    )


def test_parses_google_data_coordinates():
    assert parse_maps_url(
        "https://www.google.com/maps/place/example/data=!3d19.4326!4d-99.1332"
    ) == (19.4326, -99.1332)


def test_rejects_garbage():
    assert parse_maps_url("https://example.com") is None


def test_short_link_needs_http_resolve():
    assert parse_maps_url("https://maps.app.goo.gl/abc123") is None
