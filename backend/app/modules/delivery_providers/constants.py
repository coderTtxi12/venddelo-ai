"""Platform delivery provider identifiers."""

MEXY_PROVIDER_SLUG = "mexy-reparto"
MEXY_PROVIDER_NAME = "Mexy Reparto"
MEXY_PROVIDER_SLUG_PREFIX = MEXY_PROVIDER_SLUG
MEXY_LEGACY_SLUG = "mexy"


def is_mexy_provider_slug(slug: str) -> bool:
    return slug == MEXY_LEGACY_SLUG or slug.startswith(MEXY_PROVIDER_SLUG_PREFIX)
