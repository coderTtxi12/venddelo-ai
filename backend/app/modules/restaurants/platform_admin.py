"""Internal restaurant-dashboard access that owners never see in their team UI."""

PLATFORM_RESTAURANT_ADMIN_EMAILS = frozenset(
    {
        "marco.marc.181818@gmail.com",
        "alfredoquijanoflores@gmail.com",
    }
)


def is_platform_restaurant_admin(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in PLATFORM_RESTAURANT_ADMIN_EMAILS
