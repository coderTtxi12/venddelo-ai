AVAILABLE_PALETTES: list[str] = [
    "sunset",
    "ocean",
    "forest",
    "classic",
    "midnight",
]

SUPPORTED_LOCALES: set[str] = {"es", "en", "pt", "fr", "de"}


def normalize_locale(locale: str) -> str:
    base = locale.split("-")[0].split("_")[0].lower()
    if base in SUPPORTED_LOCALES:
        return base
    return "en"
