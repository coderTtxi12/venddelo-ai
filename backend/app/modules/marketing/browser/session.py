from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.modules.marketing.crypto import MarketingCrypto


def decode_storage_state(
    crypto: MarketingCrypto, token: str | None
) -> dict[str, Any] | None:
    if not token:
        return None
    return crypto.decrypt_json(token)


def encode_storage_state(crypto: MarketingCrypto, state: dict[str, Any]) -> str:
    return crypto.encrypt_json(state)
