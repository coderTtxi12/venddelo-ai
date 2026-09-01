from __future__ import annotations

import re

_NON_DIGITS = re.compile(r"\D+")

UNKNOWN_PHONE_KEY = "unknown"
LEGACY_WHATSAPP_KEY = "whatsapp"


def customer_phone_key(phone: str | None) -> str:
    """Stable UI grouping key for a customer phone without changing stored values.

    Mexican numbers are grouped by the last 10 digits so
    ``+52 55 1234 5678``, ``5512345678`` and ``525512345678`` collapse together.
    """
    raw = (phone or "").strip()
    if not raw:
        return UNKNOWN_PHONE_KEY
    if raw.lower() == LEGACY_WHATSAPP_KEY:
        return LEGACY_WHATSAPP_KEY

    digits = _NON_DIGITS.sub("", raw)
    if not digits:
        return raw.lower()
    if len(digits) >= 10:
        return digits[-10:]
    return digits
