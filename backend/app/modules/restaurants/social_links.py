from __future__ import annotations

import re
from typing import Literal
from urllib.parse import urlparse

LiveMenuSocialPlacement = Literal["footer", "intro", "cover", "before_menu"]
LIVE_MENU_SOCIAL_PLACEMENTS: tuple[LiveMenuSocialPlacement, ...] = (
    "footer",
    "intro",
    "cover",
    "before_menu",
)
DEFAULT_LIVE_MENU_SOCIAL_PLACEMENT: LiveMenuSocialPlacement = "footer"

_FACEBOOK_HOSTS = frozenset(
    {
        "facebook.com",
        "www.facebook.com",
        "m.facebook.com",
        "fb.com",
        "www.fb.com",
        "fb.me",
    }
)
_INSTAGRAM_HOSTS = frozenset(
    {
        "instagram.com",
        "www.instagram.com",
    }
)


def normalize_social_url(url: str | None) -> str | None:
    if url is None:
        return None
    trimmed = url.strip()
    if not trimmed:
        return None
    if not trimmed.startswith(("http://", "https://")):
        trimmed = f"https://{trimmed}"
    return trimmed


def _host(url: str) -> str:
    parsed = urlparse(url)
    return (parsed.hostname or "").lower()


def is_valid_http_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_facebook_url(url: str) -> bool:
    return _host(url) in _FACEBOOK_HOSTS


def is_instagram_url(url: str) -> bool:
    return _host(url) in _INSTAGRAM_HOSTS


def whatsapp_contact_url(phone: str | None) -> str | None:
    if phone is None:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 8:
        return None
    return f"https://wa.me/{digits}"


def normalize_live_menu_social_placement(value: str | None) -> LiveMenuSocialPlacement:
    if value in LIVE_MENU_SOCIAL_PLACEMENTS:
        return value  # type: ignore[return-value]
    return DEFAULT_LIVE_MENU_SOCIAL_PLACEMENT


def build_public_social_links(
    *,
    enabled: bool,
    facebook_enabled: bool,
    instagram_enabled: bool,
    whatsapp_enabled: bool,
    facebook_url: str | None,
    instagram_url: str | None,
    whatsapp_phone: str | None,
) -> dict[str, str | None] | None:
    if not enabled:
        return None

    fb = normalize_social_url(facebook_url) if facebook_enabled else None
    ig = normalize_social_url(instagram_url) if instagram_enabled else None
    wa = whatsapp_contact_url(whatsapp_phone) if whatsapp_enabled else None

    if not fb and not ig and not wa:
        return None

    return {
        "facebook_url": fb,
        "instagram_url": ig,
        "whatsapp_url": wa,
    }
