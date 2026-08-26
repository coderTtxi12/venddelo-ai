from app.modules.delivery_dispatch.maps_url import extract_maps_query_text, parse_maps_url


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


def test_parses_q_query_coordinates():
    assert parse_maps_url("https://www.google.com/maps?q=19.4326,-99.1332") == (
        19.4326,
        -99.1332,
    )


def test_parses_alt_data_coordinates():
    assert parse_maps_url(
        "https://www.google.com/maps/place/example/data=!1d19.4326!2d-99.1332"
    ) == (19.4326, -99.1332)


def test_short_link_needs_http_resolve():
    assert parse_maps_url("https://maps.app.goo.gl/abc123") is None


def test_parses_search_path_with_plus_before_negative_longitude():
    assert parse_maps_url(
        "https://www.google.com/maps/search/19.635558,+-99.103323?entry=tts"
    ) == (19.635558, -99.103323)


def test_parses_query_param_coordinates():
    assert parse_maps_url(
        "https://www.google.com/maps/search/?api=1&query=48.857469,2.295821"
    ) == (48.857469, 2.295821)


PLACE_SHARE_WITHOUT_COORDS = (
    "https://www.google.com/maps/place/Tiendas+3B+Coacalco+Centro,"
    "+And.+Emiliano+Zapata+S%2FN,+Col.+Centro,+55709+San+Francisco+Coacalco,"
    "+M%C3%A9x./data=!4m2!3m1!1s0x85d1f5862d3edc43:0x173398338da507f6!18m1!1e1"
    "?utm_source=mstt_1&entry=gps"
)


def test_place_share_url_without_coordinates_is_not_parsed_locally():
    assert parse_maps_url(PLACE_SHARE_WITHOUT_COORDS) is None


def test_extracts_place_name_from_maps_place_path():
    assert extract_maps_query_text(PLACE_SHARE_WITHOUT_COORDS) == (
        "Tiendas 3B Coacalco Centro, And. Emiliano Zapata S/N, Col. Centro, "
        "55709 San Francisco Coacalco, Méx."
    )


def test_extracts_q_text_for_geocoding():
    assert extract_maps_query_text(
        "https://www.google.com/maps?q=Andador+Emiliano+Zapata+Coacalco"
    ) == "Andador Emiliano Zapata Coacalco"
