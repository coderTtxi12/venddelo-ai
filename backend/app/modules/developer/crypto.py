from __future__ import annotations

import hashlib
import hmac
import secrets


API_KEY_PREFIX = "mexy_dev_"
WEBHOOK_SECRET_PREFIX = "whsec_"


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix_for_display, key_hash)."""
    body = secrets.token_urlsafe(32)
    full = f"{API_KEY_PREFIX}{body}"
    prefix = full[: len(API_KEY_PREFIX) + 8]
    return full, prefix, hash_api_key(full)


def generate_webhook_signing_secret() -> tuple[str, str]:
    """Returns (full_secret, hint for UI)."""
    body = secrets.token_urlsafe(24)
    full = f"{WEBHOOK_SECRET_PREFIX}{body}"
    hint = f"…{full[-4:]}"
    return full, hint


def sign_webhook_payload(secret: str, body: bytes, timestamp: int) -> str:
    signed = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"sha256={signed}"
