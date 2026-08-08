from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet


class MarketingCrypto:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt_str(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt_str(self, token: str) -> str:
        return self._fernet.decrypt(token.encode("ascii")).decode("utf-8")

    def encrypt_json(self, value: dict[str, Any]) -> str:
        return self.encrypt_str(json.dumps(value, separators=(",", ":")))

    def decrypt_json(self, token: str) -> dict[str, Any]:
        return json.loads(self.decrypt_str(token))


def build_marketing_crypto(key: str | None = None) -> MarketingCrypto:
    if key is None:
        from app.core.config import get_settings

        key = get_settings().marketing_agent_fernet_key
    if not key:
        raise ValueError("MARKETING_AGENT_FERNET_KEY is required")
    return MarketingCrypto(key)
