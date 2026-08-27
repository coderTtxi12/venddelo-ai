from types import SimpleNamespace

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.delivery_dispatch.app_client import provider_rider_apk_url
from app.modules.delivery_providers.permissions import require_manage_rider_app
from app.modules.delivery_providers.rider_apk import (
    MAX_RIDER_APK_BYTES,
    validate_rider_apk_bytes,
    validate_rider_apk_filename,
    validate_rider_apk_url,
)


def test_rejects_non_apk_filename():
    try:
        validate_rider_apk_filename("mexy-rider.zip")
    except ValidationError as error:
        assert "APK" in error.message
    else:
        raise AssertionError("expected ValidationError")


def test_accepts_apk_filename():
    assert validate_rider_apk_filename("mexy-rider.apk") == "mexy-rider.apk"
    assert validate_rider_apk_filename("Mexy-Rider.APK") == "Mexy-Rider.APK"


def test_rejects_apk_over_size_limit():
    try:
        validate_rider_apk_bytes(b"PK" + b"\x00" * (MAX_RIDER_APK_BYTES + 1))
    except ValidationError as error:
        assert "80" in error.message
    else:
        raise AssertionError("expected ValidationError")


def test_accepts_zip_magic_apk():
    payload = b"PK\x03\x04" + b"\x00" * 64
    assert validate_rider_apk_bytes(payload) is payload


def test_only_owner_can_manage_rider_app():
    require_manage_rider_app("owner")
    for role in ("admin", "operator", "dispatcher", None):
        try:
            require_manage_rider_app(role)
        except ForbiddenError as error:
            assert "propietario" in error.message.lower()
            continue
        raise AssertionError(role)


def test_provider_rider_apk_url_trims_blank():
    assert provider_rider_apk_url(None) is None
    assert provider_rider_apk_url(SimpleNamespace(rider_apk_url="  ")) is None
    assert (
        provider_rider_apk_url(
            SimpleNamespace(rider_apk_url="https://cdn.example.com/mexy-rider.apk")
        )
        == "https://cdn.example.com/mexy-rider.apk"
    )


def test_accepts_https_apk_url():
    assert (
        validate_rider_apk_url("  https://cdn.example.com/mexy-rider.apk  ")
        == "https://cdn.example.com/mexy-rider.apk"
    )


def test_rejects_non_http_apk_url():
    for url in ("not-a-url", "ftp://cdn.example.com/mexy-rider.apk", "javascript:alert(1)"):
        try:
            validate_rider_apk_url(url)
        except ValidationError as error:
            assert "http" in error.message.lower()
            continue
        raise AssertionError(url)


def test_rejects_apk_size_without_reading_bytes():
    from app.modules.delivery_providers.rider_apk import validate_rider_apk_size

    try:
        validate_rider_apk_size(MAX_RIDER_APK_BYTES + 1)
    except ValidationError as error:
        assert "80" in error.message
    else:
        raise AssertionError("expected ValidationError")
    assert validate_rider_apk_size(1024) == 1024


def test_storage_path_must_belong_to_provider():
    from uuid import UUID

    from app.modules.delivery_providers.rider_apk import validate_rider_apk_storage_path

    provider_id = UUID("11111111-1111-1111-1111-111111111111")
    other_id = UUID("22222222-2222-2222-2222-222222222222")
    path = f"delivery-providers/{provider_id}/rider-app/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.apk"
    assert validate_rider_apk_storage_path(path, provider_id) == path
    try:
        validate_rider_apk_storage_path(
            f"delivery-providers/{other_id}/rider-app/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.apk",
            provider_id,
        )
    except ValidationError:
        return
    raise AssertionError("expected ValidationError")
