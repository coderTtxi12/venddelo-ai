from app.modules.restaurants.platform_admin import (
    PLATFORM_RESTAURANT_ADMIN_EMAILS,
    is_platform_restaurant_admin,
)


def test_platform_restaurant_admin_emails_include_internal_staff() -> None:
    assert PLATFORM_RESTAURANT_ADMIN_EMAILS == {
        "marco.marc.181818@gmail.com",
        "alfredoquijanoflores@gmail.com",
    }


def test_is_platform_restaurant_admin_is_case_insensitive() -> None:
    assert is_platform_restaurant_admin("Marco.Marc.181818@gmail.com") is True
    assert is_platform_restaurant_admin("marco.marc.181818@gmail.com") is True
    assert is_platform_restaurant_admin("AlfredoQuijanoFlores@gmail.com") is True
    assert is_platform_restaurant_admin("alfredoquijanoflores@gmail.com") is True


def test_is_platform_restaurant_admin_rejects_other_emails() -> None:
    assert is_platform_restaurant_admin("owner@example.com") is False
    assert is_platform_restaurant_admin("") is False
    assert is_platform_restaurant_admin(None) is False
    assert is_platform_restaurant_admin("  ") is False
