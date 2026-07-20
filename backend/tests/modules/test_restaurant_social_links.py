from app.modules.restaurants.social_links import (
    build_public_social_links,
    is_facebook_url,
    is_instagram_url,
    normalize_live_menu_social_placement,
    normalize_social_url,
    whatsapp_contact_url,
)


def test_normalize_social_url_adds_https() -> None:
    assert normalize_social_url("instagram.com/taco") == "https://instagram.com/taco"


def test_build_public_social_links_requires_enabled() -> None:
    assert (
        build_public_social_links(
            enabled=False,
            facebook_enabled=True,
            instagram_enabled=False,
            whatsapp_enabled=False,
            facebook_url="https://facebook.com/taco",
            instagram_url=None,
            whatsapp_phone="+5215512345678",
        )
        is None
    )


def test_build_public_social_links_respects_channel_toggles() -> None:
    links = build_public_social_links(
        enabled=True,
        facebook_enabled=False,
        instagram_enabled=True,
        whatsapp_enabled=True,
        facebook_url="https://facebook.com/taco",
        instagram_url="instagram.com/taco",
        whatsapp_phone="+5215512345678",
    )
    assert links is not None
    assert links["facebook_url"] is None
    assert links["instagram_url"] == "https://instagram.com/taco"
    assert links["whatsapp_url"] == "https://wa.me/5215512345678"


def test_build_public_social_links_whatsapp_only() -> None:
    links = build_public_social_links(
        enabled=True,
        facebook_enabled=False,
        instagram_enabled=False,
        whatsapp_enabled=True,
        facebook_url=None,
        instagram_url=None,
        whatsapp_phone="+5215512345678",
    )
    assert links is not None
    assert links["whatsapp_url"] == "https://wa.me/5215512345678"


def test_build_public_social_links_requires_at_least_one_link() -> None:
    assert (
        build_public_social_links(
            enabled=True,
            facebook_enabled=True,
            instagram_enabled=False,
            whatsapp_enabled=False,
            facebook_url=None,
            instagram_url=None,
            whatsapp_phone=None,
        )
        is None
    )


def test_normalize_live_menu_social_placement() -> None:
    assert normalize_live_menu_social_placement("intro") == "intro"
    assert normalize_live_menu_social_placement("invalid") == "footer"


def test_host_validation() -> None:
    assert is_facebook_url("https://facebook.com/page")
    assert is_instagram_url("https://www.instagram.com/page")
    assert not is_facebook_url("https://instagram.com/page")


def test_whatsapp_contact_url() -> None:
    assert whatsapp_contact_url("+52 55 1234 5678") == "https://wa.me/525512345678"
    assert whatsapp_contact_url("123") is None
