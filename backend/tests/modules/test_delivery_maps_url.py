from unittest.mock import patch

from app.modules.delivery_dispatch.maps_url import (
    extract_maps_camera_coordinates,
    extract_maps_cid,
    extract_maps_place_id,
    extract_maps_query_text,
    parse_maps_url,
    parse_pasted_coordinates,
    resolve_maps_coordinates,
)


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


PLACE_WITH_CAMERA_AND_PIN = (
    "https://www.google.com/maps/place/Tiendas+3B/"
    "@19.43,-99.13,17z/data=!3d19.4401!4d-99.1450"
    "!1s0x85d1f5862d3edc43:0x173398338da507f6"
)


def test_prefers_place_pin_over_camera_center():
    assert parse_maps_url(PLACE_WITH_CAMERA_AND_PIN) == (19.4401, -99.1450)


def test_extracts_camera_separately_for_geocode_bias():
    assert extract_maps_camera_coordinates(PLACE_WITH_CAMERA_AND_PIN) == (19.43, -99.13)


def test_extracts_chij_place_id():
    assert (
        extract_maps_place_id(
            "https://www.google.com/maps/place/?q=place_id:ChIJ0x85d1f5862d3edc"
        )
        == "ChIJ0x85d1f5862d3edc"
    )


def test_extracts_cid_from_feature_id():
    assert extract_maps_cid(PLACE_SHARE_WITHOUT_COORDS) == int("173398338da507f6", 16)


def test_resolve_uses_pin_without_geocoding():
    result = resolve_maps_coordinates(PLACE_WITH_CAMERA_AND_PIN, api_key="test-key")
    assert result is not None
    assert (result.latitude, result.longitude) == (19.4401, -99.1450)
    assert result.address is not None
    assert "Tiendas 3B" in result.address


def test_resolve_geocodes_place_id_when_url_has_no_pin():
    url = "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4"

    with (
        patch(
            "app.modules.delivery_dispatch.maps_url.geocode_place_id",
            return_value=(19.4401, -99.1450, "Tiendas 3B, Coacalco"),
        ) as geocode_place,
        patch(
            "app.modules.delivery_dispatch.maps_url.geocode_address_text",
            return_value=None,
        ) as geocode_text,
    ):
        result = resolve_maps_coordinates(url, api_key="test-key")

    assert result is not None
    assert (result.latitude, result.longitude) == (19.4401, -99.1450)
    assert result.address == "Tiendas 3B, Coacalco"
    geocode_place.assert_called_once_with("ChIJN1t_tDeuEmsRUsoyG83frY4", "test-key")
    geocode_text.assert_not_called()


def test_resolve_geocodes_cid_when_share_has_no_pin():
    with (
        patch(
            "app.modules.delivery_dispatch.maps_url.geocode_place_cid",
            return_value=(19.6324, -99.1101, "Tiendas 3B Coacalco Centro"),
        ) as geocode_cid,
        patch(
            "app.modules.delivery_dispatch.maps_url.geocode_address_text",
            return_value=None,
        ) as geocode_text,
    ):
        result = resolve_maps_coordinates(PLACE_SHARE_WITHOUT_COORDS, api_key="test-key")

    assert result is not None
    assert (result.latitude, result.longitude) == (19.6324, -99.1101)
    assert result.address == "Tiendas 3B Coacalco Centro"
    geocode_cid.assert_called_once_with(int("173398338da507f6", 16), "test-key")
    geocode_text.assert_not_called()


def test_resolve_geocodes_name_near_camera_when_no_place_id():
    url = "https://www.google.com/maps/place/Tiendas+3B+Coacalco/@19.43,-99.13,17z"

    with patch(
        "app.modules.delivery_dispatch.maps_url.geocode_address_text",
        return_value=(19.4401, -99.1450, "Tiendas 3B Coacalco, Méx."),
    ) as geocode_text:
        result = resolve_maps_coordinates(url, api_key="test-key")

    assert result is not None
    assert (result.latitude, result.longitude) == (19.4401, -99.1450)
    assert result.address == "Tiendas 3B Coacalco, Méx."
    geocode_text.assert_called_once()
    kwargs = geocode_text.call_args
    assert kwargs.args[0] == "Tiendas 3B Coacalco"
    assert kwargs.kwargs["bias"] == (19.43, -99.13) or (
        len(kwargs.args) >= 3 and kwargs.args[2] == (19.43, -99.13)
    )


def test_resolve_falls_back_to_camera_when_geocode_fails():
    url = "https://www.google.com/maps/@19.43,-99.13,17z"

    with patch(
        "app.modules.delivery_dispatch.maps_url.geocode_address_text",
        return_value=None,
    ):
        result = resolve_maps_coordinates(url, api_key="test-key")

    assert result is not None
    assert (result.latitude, result.longitude) == (19.43, -99.13)
    assert result.address is None


SHORT_LINK_EXPANDED = (
    "https://www.google.com/maps/place/Enrique+R%C3%A9bsamen+57,+El+Gigante,"
    "+55709+San+Francisco+Coacalco,+M%C3%A9x./@19.6245063,-99.1033746,17z/"
    "data=!3m1!4b1!4m6!3m5!1s0x85d1f3fff1c77731:0x3d8bb231a80aed87"
    "!8m2!3d19.6245013!4d-99.1007997!16s%2Fg%2F11csl7vt2f"
)


def test_prefers_pin_on_expanded_short_link():
    assert parse_maps_url(SHORT_LINK_EXPANDED) == (19.6245013, -99.1007997)


def test_parses_pasted_latitude_longitude():
    assert parse_pasted_coordinates("19.6245013, -99.1007997") == (
        19.6245013,
        -99.1007997,
    )
    assert parse_pasted_coordinates("19.6245013 N, 99.1007997 W") == (
        19.6245013,
        -99.1007997,
    )


def test_resolve_uses_pasted_coordinates():
    result = resolve_maps_coordinates("19.6245013, -99.1007997")
    assert result is not None
    assert (result.latitude, result.longitude) == (19.6245013, -99.1007997)


def test_follow_short_link_when_head_returns_200_without_location():
    from app.modules.delivery_dispatch.service import _follow_maps_redirects

    def fake_request(method: str, url: str):
        if method == "HEAD":
            return 200, None
        if method == "GET" and "maps.app.goo.gl" in url:
            return 302, SHORT_LINK_EXPANDED
        return 200, None

    with patch(
        "app.modules.delivery_dispatch.service._maps_http_request",
        side_effect=fake_request,
    ):
        assert _follow_maps_redirects("https://maps.app.goo.gl/4xyyaop7R9yPTeUMA") == (
            SHORT_LINK_EXPANDED
        )
