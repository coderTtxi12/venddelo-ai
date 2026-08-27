from __future__ import annotations


def must_update_app(app_build_number: int | None, *, min_build: int) -> bool:
    return app_build_number is None or app_build_number < min_build


def force_update_payload(
    app_build_number: int | None,
    *,
    min_build: int,
    apk_url: str | None,
) -> tuple[bool, str | None]:
    must = must_update_app(app_build_number, min_build=min_build)
    url = (apk_url or "").strip() or None
    return must, url if must else None


def provider_rider_apk_url(provider: object | None) -> str | None:
    if provider is None:
        return None
    url = getattr(provider, "rider_apk_url", None)
    return (url or "").strip() or None
